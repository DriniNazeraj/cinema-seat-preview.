import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { migrate } from '../scripts/migrate.ts'
import { seed } from '../scripts/seed.ts'
import { createApp } from '../src/app.ts'
import {
  ACCESS_SEAT_MISMATCH_MESSAGE,
  CHILD_ONLY_MESSAGE,
  PLACEHOLDER_TICKET_PRICES,
} from '../src/contract.ts'
import { pool } from '../src/db.ts'

const showId = 'ticket-rules'
let server: Server
let base: string

type ErrorBody = { code?: string; message?: string; fields?: Record<string, string> }
type Envelope = {
  ok: boolean
  data?: {
    total?: number
    status?: string
    seats?: string[]
    tickets?: { seatId: string; ticketType: string; priceCents: number }[]
    hall?: { rows: { label: string; seats: { id: string; kind: string }[] }[] }
  }
  error?: ErrorBody
}

async function reset(): Promise<void> {
  await pool.query('DELETE FROM seat_occupancy WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM booking_seats WHERE booking_id IN (SELECT id FROM bookings WHERE show_id = $1)', [showId])
  await pool.query('DELETE FROM bookings WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM holds WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM idempotency_keys WHERE key LIKE $1', [`${showId}%`])
  await pool.query('DELETE FROM ticket_prices WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM shows WHERE id = $1', [showId])
}

async function post(path: string, body: unknown): Promise<{ status: number; body: Envelope }> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Envelope }
}

async function hold(seats: string[]): Promise<string> {
  const result = await post('/api/holds', { showId, seats })
  expect(result.status, JSON.stringify(result.body)).toBe(201)
  const id = (result.body.data as { id?: string } | undefined)?.id
  if (!id) throw new Error('hold did not return an id')
  return id
}

function booking(holdId: string, tickets: { seatId: string; ticketType: string }[]) {
  return post('/api/bookings', {
    holdId,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+355000000',
    tickets,
  })
}

beforeAll(async () => {
  await migrate()
  await seed()
  await reset()
  await pool.query(
    `INSERT INTO shows (id, movie_id, start, format, hall_id, sold_out)
     VALUES ($1, 'starlight-run', now() + interval '2 days', '2D', 'h1', false)`,
    [showId],
  )
  await pool.query(
    `INSERT INTO ticket_prices (show_id, ticket_type, price_cents, currency) VALUES
       ($1, 'adult', $2, 'EUR'),
       ($1, 'child', $3, 'EUR'),
       ($1, 'disabled', $4, 'EUR')`,
    [showId, PLACEHOLDER_TICKET_PRICES.adult, PLACEHOLDER_TICKET_PRICES.child, PLACEHOLDER_TICKET_PRICES.disabled],
  )

  server = createApp().listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address() as AddressInfo
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  }
  await reset()
  await pool.end()
})

test('last row of each hall has access seats and companions inside them', async () => {
  const result = await pool.query<{ hall_id: string; id: string; kind: string }>(
    `SELECT hall_id, id, kind
     FROM seats
     WHERE row = 'J' AND n IN (1, 2, 3, 14, 15, 16)
     ORDER BY hall_id, n`,
  )
  const byHall = new Map<string, string[]>()
  for (const row of result.rows) {
    const list = byHall.get(row.hall_id) ?? []
    list.push(`${row.id}:${row.kind}`)
    byHall.set(row.hall_id, list)
  }
  const expected = ['J1:access', 'J2:access', 'J3:companion', 'J14:companion', 'J15:access', 'J16:access']
  expect(byHall.get('h1')).toEqual(expected)
  expect(byHall.get('h2')).toEqual(expected)

  const standard = await pool.query<{ kind: string }>(
    `SELECT kind FROM seats WHERE hall_id = 'h1' AND id = 'A1'`,
  )
  expect(standard.rows[0]?.kind).toBe('standard')
})

test('seat map exposes kind', async () => {
  const response = await fetch(`${base}/api/shows/${showId}/seat-map`)
  expect(response.status).toBe(200)
  const body = (await response.json()) as Envelope
  const seats = new Map(
    (body.data?.hall?.rows ?? []).flatMap((row) => row.seats.map((seat) => [seat.id, seat.kind])),
  )
  expect(seats.get('A1')).toBe('standard')
  expect(seats.get('J1')).toBe('access')
  expect(seats.get('J2')).toBe('access')
  expect(seats.get('J3')).toBe('companion')
  expect(seats.get('J14')).toBe('companion')
  expect(seats.get('J15')).toBe('access')
  expect(seats.get('J16')).toBe('access')
})

test('adult and disabled books an access seat', async () => {
  const holdId = await hold(['J1', 'A1'])
  const result = await booking(holdId, [
    { seatId: 'J1', ticketType: 'disabled' },
    { seatId: 'A1', ticketType: 'adult' },
  ])
  expect(result.status).toBe(201)
  expect(result.body.ok).toBe(true)
  expect(result.body.data?.status).toBe('pending')
  expect(result.body.data?.total).toBe(PLACEHOLDER_TICKET_PRICES.adult + PLACEHOLDER_TICKET_PRICES.disabled)
  expect(result.body.data?.tickets).toEqual([
    { seatId: 'J1', ticketType: 'disabled', priceCents: PLACEHOLDER_TICKET_PRICES.disabled },
    { seatId: 'A1', ticketType: 'adult', priceCents: PLACEHOLDER_TICKET_PRICES.adult },
  ])
})

test('disabled-only booking on an access seat succeeds', async () => {
  const holdId = await hold(['J2'])
  const result = await booking(holdId, [{ seatId: 'J2', ticketType: 'disabled' }])
  expect(result.status).toBe(201)
  expect(result.body.data?.total).toBe(PLACEHOLDER_TICKET_PRICES.disabled)
  expect(result.body.data?.tickets).toEqual([
    { seatId: 'J2', ticketType: 'disabled', priceCents: PLACEHOLDER_TICKET_PRICES.disabled },
  ])
})

test('child-only booking is rejected', async () => {
  const holdId = await hold(['A2'])
  const result = await booking(holdId, [{ seatId: 'A2', ticketType: 'child' }])
  expect(result.status).toBe(422)
  expect(result.body.error?.code).toBe('CHILD_ONLY_BOOKING')
  expect(result.body.error?.message).toBe(CHILD_ONLY_MESSAGE)
  expect(result.body.error?.fields?.tickets).toBe(CHILD_ONLY_MESSAGE)
})

test('an access seat without a disabled ticket is rejected', async () => {
  const holdId = await hold(['J15'])
  const result = await booking(holdId, [{ seatId: 'J15', ticketType: 'adult' }])
  expect(result.status).toBe(422)
  expect(result.body.error?.code).toBe('ACCESS_SEAT_MISMATCH')
  expect(result.body.error?.message).toBe(ACCESS_SEAT_MISMATCH_MESSAGE)
  expect(result.body.error?.fields?.tickets).toBe(ACCESS_SEAT_MISMATCH_MESSAGE)
})

test('a companion seat does not count as access', async () => {
  const holdId = await hold(['J3'])
  const result = await booking(holdId, [{ seatId: 'J3', ticketType: 'adult' }])
  expect(result.status).toBe(201)
  expect(result.body.data?.total).toBe(PLACEHOLDER_TICKET_PRICES.adult)
})

test('an unknown ticket type is a validation error', async () => {
  const result = await booking('00000000-0000-4000-8000-000000000001', [
    { seatId: 'A1', ticketType: 'adult' },
    { seatId: 'A2', ticketType: 'senior' },
  ])
  expect(result.status).toBe(400)
  expect(result.body.error?.code).toBe('VALIDATION_ERROR')
  expect(result.body.error?.fields?.['tickets.1.ticketType']).toBeTruthy()
})

test('nine tickets are rejected', async () => {
  const tickets = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9'].map((seatId, index) => ({
    seatId,
    ticketType: index === 8 ? 'disabled' : index % 2 === 0 ? 'adult' : 'child',
  }))
  const result = await booking('00000000-0000-4000-8000-000000000002', tickets)
  expect(result.status).toBe(400)
  expect(result.body.error?.code).toBe('VALIDATION_ERROR')
  expect(result.body.error?.fields?.tickets).toBe('You can book up to 8 seats at once.')
})
