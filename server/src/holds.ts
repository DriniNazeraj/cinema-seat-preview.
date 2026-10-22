import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { config } from './config.ts'
import { ApiException } from './errors.ts'
import { iso, pgErrorCode, sameSet } from './util.ts'

type ShowLock = { id: string; hall_id: string; sold_out: boolean }
type HoldRow = {
  id: string
  show_id: string
  seats: string[]
  created_at: Date
  expires_at: Date
  released_at: Date | null
  consumed_at: Date | null
}

export type HoldJson = {
  id: string
  showId: string
  seats: string[]
  holdExpiresAt: string
  createdAt: string
}

export type ReleasedJson = {
  id: string
  released: true
  holdExpiresAt: string
}

function holdJson(row: HoldRow): HoldJson {
  return {
    id: row.id,
    showId: row.show_id,
    seats: row.seats,
    holdExpiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
  }
}

function invalidUuid(err: unknown): boolean {
  return pgErrorCode(err) === '22P02'
}

async function lockHold(client: pg.PoolClient, id: string): Promise<HoldRow | null> {
  try {
    const result = await client.query<HoldRow>(
      `SELECT id, show_id, seats, created_at, expires_at, released_at, consumed_at
       FROM holds
       WHERE id = $1::uuid
       FOR UPDATE`,
      [id],
    )
    return result.rows[0] ?? null
  } catch (err) {
    if (invalidUuid(err)) return null
    throw err
  }
}

async function liveOccupancy(client: pg.PoolClient, holdId: string): Promise<Set<string>> {
  const result = await client.query<{ seat_id: string }>(
    `SELECT seat_id
     FROM seat_occupancy
     WHERE hold_id = $1::uuid
       AND kind = 'hold'
       AND expires_at > now()
     FOR UPDATE`,
    [holdId],
  )
  return new Set(result.rows.map((row) => row.seat_id))
}

function timeLive(row: HoldRow, occupancy: Set<string>): boolean {
  if (row.released_at || row.consumed_at) return false
  if (!sameSet(row.seats, [...occupancy])) return false
  return true
}

/**
 * Reserve seats for HOLD_SECONDS.
 * The primary key on seat_occupancy is the lock: insert ... on conflict do nothing.
 * Expired holds on the requested seats are removed in this transaction first.
 */
export async function createHold(
  client: pg.PoolClient,
  input: { showId: string; seats: string[] },
): Promise<HoldJson> {
  const show = await client.query<ShowLock>(
    `SELECT id, hall_id, sold_out FROM shows WHERE id = $1`,
    [input.showId],
  )
  const showRow = show.rows[0]
  if (!showRow) throw new ApiException('NOT_FOUND')

  const known = await client.query<{ id: string }>(
    `SELECT id FROM seats WHERE hall_id = $1 AND id = ANY($2::text[])`,
    [showRow.hall_id, input.seats],
  )
  const knownIds = new Set(known.rows.map((row) => row.id))
  const unknown = input.seats.filter((id) => !knownIds.has(id))
  if (unknown.length) {
    throw new ApiException('VALIDATION_ERROR', {
      fields: { seats: `Unknown seat: ${unknown.join(', ')}.` },
    })
  }
  if (showRow.sold_out) throw new ApiException('SHOW_SOLD_OUT')

  const lockOrder = [...input.seats].sort()
  await client.query(
    `DELETE FROM seat_occupancy
     WHERE show_id = $1
       AND seat_id = ANY($2::text[])
       AND kind = 'hold'
       AND expires_at <= now()`,
    [showRow.id, lockOrder],
  )

  const free = await client.query<{ free: string }>(
    `SELECT count(*)::int AS free
     FROM seats AS st
     WHERE st.hall_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM seat_occupancy AS o
         WHERE o.show_id = $2
           AND o.seat_id = st.id
           AND (
             o.kind = 'booked'
             OR (o.kind = 'hold' AND o.expires_at > now())
           )
       )`,
    [showRow.hall_id, showRow.id],
  )
  if (Number(free.rows[0]?.free ?? 0) === 0) throw new ApiException('SHOW_SOLD_OUT')

  const holdId = randomUUID()
  const insertedHold = await client.query<HoldRow>(
    `INSERT INTO holds (id, show_id, seats, expires_at)
     VALUES ($1::uuid, $2, $3::text[], now() + ($4::int * interval '1 second'))
     RETURNING id, show_id, seats, created_at, expires_at, released_at, consumed_at`,
    [holdId, showRow.id, input.seats, config.holdSeconds],
  )
  const hold = insertedHold.rows[0]
  if (!hold) throw new Error('hold insert did not return a row')

  const taken = await client.query<{ seat_id: string }>(
    `INSERT INTO seat_occupancy (show_id, seat_id, kind, hold_id, expires_at)
     SELECT $1, seat_id, 'hold', $2::uuid, $3
     FROM unnest($4::text[]) AS seat_id
     ORDER BY seat_id
     ON CONFLICT (show_id, seat_id) DO NOTHING
     RETURNING seat_id`,
    [showRow.id, holdId, hold.expires_at, lockOrder],
  )
  const got = new Set(taken.rows.map((row) => row.seat_id))
  if (got.size !== input.seats.length) {
    const missing = input.seats.filter((id) => !got.has(id))
    throw new ApiException('SEAT_TAKEN', { seatIds: missing })
  }
  return holdJson(hold)
}

export async function refreshHold(client: pg.PoolClient, id: string): Promise<HoldJson> {
  const hold = await lockHold(client, id)
  if (!hold) throw new ApiException('NOT_FOUND')
  const occupancy = await liveOccupancy(client, hold.id)
  const stillInTime = await client.query<{ live: boolean }>(
    `SELECT expires_at > now() AS live FROM holds WHERE id = $1::uuid`,
    [hold.id],
  )
  if (!stillInTime.rows[0]?.live || !timeLive(hold, occupancy)) {
    throw new ApiException('HOLD_EXPIRED')
  }
  const updated = await client.query<HoldRow>(
    `UPDATE holds
     SET expires_at = now() + ($2::int * interval '1 second')
     WHERE id = $1::uuid
     RETURNING id, show_id, seats, created_at, expires_at, released_at, consumed_at`,
    [hold.id, config.holdSeconds],
  )
  const row = updated.rows[0]
  if (!row) throw new Error('hold refresh did not return a row')
  await client.query(
    `UPDATE seat_occupancy
     SET expires_at = $2
     WHERE hold_id = $1::uuid AND kind = 'hold'`,
    [hold.id, row.expires_at],
  )
  return holdJson(row)
}

export async function releaseHold(client: pg.PoolClient, id: string): Promise<ReleasedJson> {
  const hold = await lockHold(client, id)
  if (!hold) throw new ApiException('NOT_FOUND')
  const booking = await client.query<{ status: string }>(
    `SELECT status FROM bookings WHERE hold_id = $1::uuid FOR UPDATE`,
    [hold.id],
  )
  const status = booking.rows[0]?.status
  if (hold.consumed_at || status === 'confirmed') throw new ApiException('HOLD_CONSUMED')

  if (!hold.released_at) {
    const expired = await client.query<{ expired: boolean }>(
      `SELECT expires_at <= now() AS expired FROM holds WHERE id = $1::uuid`,
      [hold.id],
    )
    if (expired.rows[0]?.expired) {
      await client.query(`DELETE FROM seat_occupancy WHERE hold_id = $1::uuid AND kind = 'hold'`, [hold.id])
      await client.query(
        `UPDATE bookings SET status = 'expired' WHERE hold_id = $1::uuid AND status = 'pending'`,
        [hold.id],
      )
    } else {
      await client.query(`DELETE FROM seat_occupancy WHERE hold_id = $1::uuid`, [hold.id])
      await client.query(`UPDATE holds SET released_at = now() WHERE id = $1::uuid`, [hold.id])
      await client.query(
        `UPDATE bookings SET status = 'cancelled' WHERE hold_id = $1::uuid AND status = 'pending'`,
        [hold.id],
      )
    }
  }

  return { id: hold.id, released: true, holdExpiresAt: iso(hold.expires_at) }
}
