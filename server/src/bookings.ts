import { randomBytes, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { CHILD_ONLY_MESSAGE, CURRENCY, type TicketType } from './contract.ts'
import { ApiException } from './errors.ts'
import { int, iso, pgConstraint, pgErrorCode, sameSet } from './util.ts'

type TicketInput = { seatId: string; ticketType: TicketType }

export type BookingBody = {
  holdId: string
  name: string
  email: string
  phone?: string
  tickets: TicketInput[]
}

type BookingRow = {
  id: string
  ref: string
  show_id: string
  hold_id: string
  name: string
  email: string
  phone: string | null
  status: 'pending' | 'confirmed' | 'expired' | 'cancelled'
  currency: string
  total_cents: number
  created_at: Date
  confirmed_at: Date | null
  hold_expires_at: Date
  hold_seats: string[]
  released_at: Date | null
  consumed_at: Date | null
}

type TicketRow = { seat_id: string; ticket_type: TicketType; price_cents: number }

export type BookingJson = {
  ref: string
  showId: string
  seats: string[]
  name: string
  email: string
  phone?: string
  total: number
  currency: typeof CURRENCY
  createdAt: string
  status: BookingRow['status']
  holdId: string
  tickets: { seatId: string; ticketType: TicketType; priceCents: number }[]
  holdExpiresAt?: string
  confirmedAt?: string
}

type Outcome = { ok: true; status: number; data: BookingJson } | { ok: false; error: ApiException }

function newRef(): string {
  return `LUM-${randomBytes(16).toString('hex').toUpperCase()}`
}

function phoneOrNull(phone: string | undefined): string | null {
  return phone ? phone : null
}

function ticketsKey(tickets: readonly { seatId: string; ticketType: string }[]): string {
  return tickets
    .map((ticket) => `${ticket.seatId}:${ticket.ticketType}`)
    .sort()
    .join(',')
}

async function loadBooking(client: pg.PoolClient, ref: string): Promise<BookingJson | null> {
  const result = await client.query<BookingRow>(
    `SELECT
       b.id, b.ref, b.show_id, b.hold_id, b.name, b.email, b.phone, b.status,
       b.currency, b.total_cents, b.created_at, b.confirmed_at,
       h.expires_at AS hold_expires_at, h.seats AS hold_seats,
       h.released_at, h.consumed_at
     FROM bookings AS b
     JOIN holds AS h ON h.id = b.hold_id
     WHERE b.ref = $1`,
    [ref],
  )
  const row = result.rows[0]
  if (!row) return null
  const tickets = await client.query<TicketRow>(
    `SELECT seat_id, ticket_type, price_cents
     FROM booking_seats
     WHERE booking_id = $1`,
    [row.id],
  )
  return bookingJson(row, tickets.rows)
}

function bookingJson(row: BookingRow, ticketRows: TicketRow[]): BookingJson {
  const bySeat = new Map(ticketRows.map((ticket) => [ticket.seat_id, ticket]))
  const seats = row.hold_seats.filter((id) => bySeat.has(id))
  for (const ticket of ticketRows) {
    if (!seats.includes(ticket.seat_id)) seats.push(ticket.seat_id)
  }
  const tickets = seats.map((seatId) => {
    const ticket = bySeat.get(seatId)
    if (!ticket) throw new Error(`Booking ${row.ref} is missing seat ${seatId}`)
    return {
      seatId,
      ticketType: ticket.ticket_type,
      priceCents: int(ticket.price_cents, 'price'),
    }
  })
  const record: BookingJson = {
    ref: row.ref,
    showId: row.show_id,
    seats,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    total: int(row.total_cents, 'total'),
    currency: CURRENCY,
    createdAt: iso(row.created_at),
    status: row.status,
    holdId: row.hold_id,
    tickets,
  }
  if (row.status === 'pending') record.holdExpiresAt = iso(row.hold_expires_at)
  if (row.status === 'confirmed') {
    if (!row.confirmed_at) throw new Error(`Booking ${row.ref} is confirmed without confirmed_at`)
    record.confirmedAt = iso(row.confirmed_at)
  }
  if (!record.phone) delete record.phone
  return record
}

async function expirePending(client: pg.PoolClient, ref: string): Promise<void> {
  await client.query(
    `UPDATE bookings AS b
     SET status = 'expired'
     FROM holds AS h
     WHERE b.ref = $1
       AND b.hold_id = h.id
       AND b.status = 'pending'
       AND h.released_at IS NULL
       AND h.consumed_at IS NULL
       AND h.expires_at <= now()`,
    [ref],
  )
}

export async function readBooking(client: pg.PoolClient, ref: string): Promise<BookingJson> {
  await expirePending(client, ref)
  const booking = await loadBooking(client, ref)
  if (!booking) throw new ApiException('NOT_FOUND')
  return booking
}

export async function createBooking(client: pg.PoolClient, input: BookingBody): Promise<Outcome> {
  if (!input.tickets.some((ticket) => ticket.ticketType === 'adult')) {
    throw new ApiException('CHILD_ONLY_BOOKING', { fields: { tickets: CHILD_ONLY_MESSAGE } })
  }

  let hold: {
    id: string
    show_id: string
    seats: string[]
    expires_at: Date
    released_at: Date | null
    consumed_at: Date | null
  }
  try {
    const locked = await client.query<typeof hold>(
      `SELECT id, show_id, seats, expires_at, released_at, consumed_at
       FROM holds
       WHERE id = $1::uuid
       FOR UPDATE`,
      [input.holdId],
    )
    const row = locked.rows[0]
    if (!row) throw new ApiException('NOT_FOUND')
    hold = row
  } catch (err) {
    if (err instanceof ApiException) throw err
    if (pgErrorCode(err) === '22P02') throw new ApiException('NOT_FOUND')
    throw err
  }

  const existing = await client.query<{ id: string; status: BookingRow['status'] }>(
    `SELECT id, status FROM bookings WHERE hold_id = $1::uuid FOR UPDATE`,
    [hold.id],
  )
  const prior = existing.rows[0]

  if (hold.consumed_at || prior?.status === 'confirmed') throw new ApiException('HOLD_CONSUMED')

  const clock = await client.query<{ expired: boolean }>(
    `SELECT (expires_at <= now()) AS expired FROM holds WHERE id = $1::uuid`,
    [hold.id],
  )
  if (hold.released_at || clock.rows[0]?.expired || prior?.status === 'expired' || prior?.status === 'cancelled') {
    throw new ApiException('HOLD_EXPIRED')
  }

  const occupancy = await client.query<{ seat_id: string }>(
    `SELECT seat_id
     FROM seat_occupancy
     WHERE hold_id = $1::uuid
       AND kind = 'hold'
       AND expires_at > now()
     FOR UPDATE`,
    [hold.id],
  )
  const live = new Set(occupancy.rows.map((row) => row.seat_id))
  if (!sameSet(hold.seats, [...live])) {
    const missing = hold.seats.filter((id) => !live.has(id))
    throw new ApiException('SEAT_TAKEN', { seatIds: missing.length ? missing : hold.seats })
  }

  const requested = input.tickets.map((ticket) => ticket.seatId)
  if (!sameSet(requested, hold.seats)) throw new ApiException('HOLD_SEAT_MISMATCH')

  if (prior?.status === 'pending') {
    const current = await loadBookingById(client, prior.id)
    if (!current) throw new Error('pending booking disappeared')
    const same =
      current.name === input.name &&
      current.email === input.email &&
      (current.phone ?? null) === phoneOrNull(input.phone) &&
      ticketsKey(current.tickets) === ticketsKey(input.tickets)
    if (!same) throw new ApiException('CONFLICT')
    return { ok: true, status: 200, data: current }
  }

  const prices = await client.query<{ ticket_type: TicketType; price_cents: number }>(
    `SELECT ticket_type, price_cents FROM ticket_prices WHERE show_id = $1`,
    [hold.show_id],
  )
  const priceOf = new Map(prices.rows.map((row) => [row.ticket_type, int(row.price_cents, 'price')]))
  const adult = priceOf.get('adult')
  const child = priceOf.get('child')
  if (adult === undefined || child === undefined) throw new Error(`Show ${hold.show_id} is missing ticket prices`)

  const lines = hold.seats.map((seatId) => {
    const ticket = input.tickets.find((item) => item.seatId === seatId)
    if (!ticket) throw new ApiException('HOLD_SEAT_MISMATCH')
    const priceCents = ticket.ticketType === 'adult' ? adult : child
    return { seatId, ticketType: ticket.ticketType, priceCents }
  })
  const total = lines.reduce((sum, line) => sum + line.priceCents, 0)
  const bookingId = randomUUID()

  let ref = ''
  let createdAt: Date | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    ref = newRef()
    await client.query('SAVEPOINT booking_ref')
    try {
      const inserted = await client.query<{ created_at: Date }>(
        `INSERT INTO bookings (
           id, ref, show_id, hold_id, name, email, phone, status, currency, total_cents
         ) VALUES (
           $1::uuid, $2, $3, $4::uuid, $5, $6, $7, 'pending', 'EUR', $8
         )
         RETURNING created_at`,
        [bookingId, ref, hold.show_id, hold.id, input.name, input.email, phoneOrNull(input.phone), total],
      )
      createdAt = inserted.rows[0]?.created_at ?? null
      await client.query('RELEASE SAVEPOINT booking_ref')
      break
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT booking_ref')
      if (pgErrorCode(err) === '23505' && pgConstraint(err) === 'bookings_ref_key') continue
      if (pgErrorCode(err) === '23505') throw new ApiException('CONFLICT')
      throw err
    }
  }
  if (!createdAt) throw new Error('could not allocate a booking ref')

  for (const line of lines) {
    await client.query(
      `INSERT INTO booking_seats (booking_id, seat_id, ticket_type, price_cents)
       VALUES ($1::uuid, $2, $3, $4)`,
      [bookingId, line.seatId, line.ticketType, line.priceCents],
    )
  }

  const record = await loadBookingById(client, bookingId)
  if (!record) throw new Error('booking insert did not reload')
  return { ok: true, status: 201, data: record }
}

async function loadBookingById(client: pg.PoolClient, id: string): Promise<BookingJson | null> {
  const result = await client.query<{ ref: string }>(`SELECT ref FROM bookings WHERE id = $1::uuid`, [id])
  const ref = result.rows[0]?.ref
  if (!ref) return null
  return loadBooking(client, ref)
}

/**
 * Marks a pending booking confirmed and its seats booked.
 * PAYMENT STEP: not implemented. Do not charge anyone. There is no card, no
 * PSP, and no payment id. A future payment for `total` cents in `currency`
 * slots in immediately before the status flip, inside this same transaction,
 * and must succeed before status becomes confirmed.
 */
export async function confirmBooking(client: pg.PoolClient, ref: string): Promise<Outcome> {
  const found = await client.query<{ id: string; hold_id: string }>(
    `SELECT id, hold_id FROM bookings WHERE ref = $1`,
    [ref],
  )
  const booking = found.rows[0]
  if (!booking) throw new ApiException('NOT_FOUND')

  await client.query(`SELECT id FROM holds WHERE id = $1::uuid FOR UPDATE`, [booking.hold_id])
  const locked = await client.query<{ status: BookingRow['status'] }>(
    `SELECT status FROM bookings WHERE id = $1::uuid FOR UPDATE`,
    [booking.id],
  )
  const status = locked.rows[0]?.status
  if (!status) throw new ApiException('NOT_FOUND')
  if (status === 'confirmed') {
    const record = await loadBooking(client, ref)
    if (!record) throw new ApiException('NOT_FOUND')
    return { ok: true, status: 200, data: record }
  }
  if (status === 'cancelled') throw new ApiException('BOOKING_NOT_CONFIRMABLE')

  const hold = await client.query<{
    expired: boolean
    released_at: Date | null
    consumed_at: Date | null
    seats: string[]
  }>(
    `SELECT expires_at <= now() AS expired, released_at, consumed_at, seats
     FROM holds WHERE id = $1::uuid`,
    [booking.hold_id],
  )
  const holdRow = hold.rows[0]
  if (!holdRow) throw new ApiException('NOT_FOUND')
  if (holdRow.released_at) throw new ApiException('BOOKING_NOT_CONFIRMABLE')
  if (status === 'expired' || holdRow.expired || holdRow.consumed_at) {
    await client.query(
      `DELETE FROM seat_occupancy WHERE hold_id = $1::uuid AND kind = 'hold'`,
      [booking.hold_id],
    )
    await client.query(
      `UPDATE bookings SET status = 'expired' WHERE id = $1::uuid AND status = 'pending'`,
      [booking.id],
    )
    return { ok: false, error: new ApiException('HOLD_EXPIRED') }
  }

  const occupancy = await client.query<{ seat_id: string }>(
    `SELECT seat_id
     FROM seat_occupancy
     WHERE hold_id = $1::uuid AND kind = 'hold' AND expires_at > now()
     FOR UPDATE`,
    [booking.hold_id],
  )
  const live = new Set(occupancy.rows.map((row) => row.seat_id))
  if (!sameSet(holdRow.seats, [...live])) {
    await client.query(
      `DELETE FROM seat_occupancy WHERE hold_id = $1::uuid AND kind = 'hold'`,
      [booking.hold_id],
    )
    await client.query(
      `UPDATE bookings SET status = 'expired' WHERE id = $1::uuid AND status = 'pending'`,
      [booking.id],
    )
    return { ok: false, error: new ApiException('HOLD_EXPIRED') }
  }

  // PAYMENT STEP — not implemented. Do not charge anyone.
  // Take a successful payment for this booking's total cents in EUR here,
  // then flip the rows below. Until that exists, confirm is only the status change.
  const updatedSeats = await client.query(
    `UPDATE seat_occupancy
     SET kind = 'booked', expires_at = NULL, booking_id = $2::uuid
     WHERE hold_id = $1::uuid AND kind = 'hold'`,
    [booking.hold_id, booking.id],
  )
  if ((updatedSeats.rowCount ?? 0) !== holdRow.seats.length) {
    throw new Error('confirm did not keep every held seat')
  }
  await client.query(
    `UPDATE bookings
     SET status = 'confirmed', confirmed_at = now()
     WHERE id = $1::uuid`,
    [booking.id],
  )
  await client.query(`UPDATE holds SET consumed_at = now() WHERE id = $1::uuid`, [booking.hold_id])
  const record = await loadBooking(client, ref)
  if (!record) throw new Error('confirmed booking did not reload')
  return { ok: true, status: 200, data: record }
}
