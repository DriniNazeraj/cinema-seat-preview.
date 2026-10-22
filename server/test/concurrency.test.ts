import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createApp } from '../src/app.ts'
import { seatTakenMessage } from '../src/contract.ts'
import { pool } from '../src/db.ts'
import { migrate } from '../scripts/migrate.ts'

const showId = 'concurrency-one-seat'
let server: Server
let base: string

async function reset(): Promise<void> {
  await pool.query('DELETE FROM seat_occupancy WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM booking_seats WHERE booking_id IN (SELECT id FROM bookings WHERE show_id = $1)', [showId])
  await pool.query('DELETE FROM bookings WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM holds WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM ticket_prices WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM shows WHERE id = $1', [showId])
}

beforeAll(async () => {
  await migrate()
  await reset()
  await pool.query(
    `INSERT INTO movies (id, title, tagline, runtime_min, rating, genres, synopsis, palette, placeholder, position)
     VALUES ('starlight-run', 'Starlight Run', 'placeholder', 124, 'PG-13', ARRAY['Action'], '[PH]', ARRAY['#7A1F2B', '#F2B544'], true, 0)
     ON CONFLICT (id) DO NOTHING`,
  )
  await pool.query(
    `INSERT INTO halls (id, name, columns) VALUES ('h1', 'Hall 1 [PH]', 18) ON CONFLICT (id) DO NOTHING`,
  )
  await pool.query(
    `INSERT INTO seats (hall_id, id, row, n, x, type) VALUES ('h1', 'A1', 'A', 1, 0, 'std')
     ON CONFLICT (hall_id, id) DO NOTHING`,
  )
  await pool.query(
    `INSERT INTO shows (id, movie_id, start, format, hall_id, sold_out)
     VALUES ($1, 'starlight-run', now() + interval '1 day', '2D', 'h1', false)`,
    [showId],
  )
  await pool.query(
    `INSERT INTO ticket_prices (show_id, ticket_type, price_cents, currency) VALUES
       ($1, 'adult', 1200, 'EUR'),
       ($1, 'child', 800, 'EUR'),
       ($1, 'disabled', 800, 'EUR')`,
    [showId],
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

test('two simultaneous holds on one seat: exactly one wins', async () => {
  const body = JSON.stringify({ showId, seats: ['A1'] })
  const post = () =>
    fetch(`${base}/api/holds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.40' },
      body,
    })
  const [left, right] = await Promise.all([post(), post()])
  const leftBody = (await left.json()) as {
    ok: boolean
    data?: { seats: string[] }
    error?: { code: string; message: string; seatIds?: string[] }
  }
  const rightBody = (await right.json()) as typeof leftBody
  const results = [
    { status: left.status, body: leftBody },
    { status: right.status, body: rightBody },
  ]
  const statuses = results.map((result) => result.status).sort()
  expect(statuses).toEqual([201, 409])

  const winner = results.find((result) => result.status === 201)
  const loser = results.find((result) => result.status === 409)
  expect(winner?.body.ok).toBe(true)
  expect(winner?.body.data?.seats).toEqual(['A1'])
  expect(loser?.body.ok).toBe(false)
  expect(loser?.body.error?.code).toBe('SEAT_TAKEN')
  expect(loser?.body.error?.seatIds).toEqual(['A1'])
  expect(loser?.body.error?.message).toBe(seatTakenMessage(['A1']))

  const occupancy = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM seat_occupancy WHERE show_id = $1 AND seat_id = 'A1'`,
    [showId],
  )
  const holds = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM holds WHERE show_id = $1`, [showId])
  expect(occupancy.rows[0]?.n).toBe(1)
  expect(holds.rows[0]?.n).toBe(1)
})
