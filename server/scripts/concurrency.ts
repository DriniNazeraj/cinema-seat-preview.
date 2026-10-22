/**
 * Two simultaneous holds on one seat. Exactly one insert wins; the primary key
 * rejects the other. Targets a running API (BASE_URL, default http://127.0.0.1:3000).
 */
import { pool } from '../src/db.ts'
import { seatTakenMessage } from '../src/contract.ts'
import { safeMessage } from '../src/util.ts'

const showId = `concurrency-live-${Date.now()}`
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000'

async function reset(): Promise<void> {
  await pool.query('DELETE FROM seat_occupancy WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM booking_seats WHERE booking_id IN (SELECT id FROM bookings WHERE show_id = $1)', [showId])
  await pool.query('DELETE FROM bookings WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM holds WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM ticket_prices WHERE show_id = $1', [showId])
  await pool.query('DELETE FROM shows WHERE id = $1', [showId])
}

async function fixture(): Promise<void> {
  await pool.query(
    `INSERT INTO movies (id, title, tagline, runtime_min, rating, genres, synopsis, palette, placeholder, position)
     VALUES ('starlight-run', 'Starlight Run', 'placeholder', 124, 'PG-13', ARRAY['Action'], '[PH]', ARRAY['#7A1F2B', '#F2B544'], true, 0)
     ON CONFLICT (id) DO NOTHING`,
  )
  await pool.query(
    `INSERT INTO halls (id, name, columns) VALUES ('h1', 'Hall 1 [PH]', 18)
     ON CONFLICT (id) DO NOTHING`,
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
}

async function main(): Promise<void> {
  await fixture()
  const body = JSON.stringify({ showId, seats: ['A1'] })
  const post = () =>
    fetch(`${base}/api/holds`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.50',
      },
      body,
    })
  const [left, right] = await Promise.all([post(), post()])
  const leftBody: unknown = await left.json()
  const rightBody: unknown = await right.json()
  const results = [
    { status: left.status, body: leftBody },
    { status: right.status, body: rightBody },
  ]
  console.log(JSON.stringify(results, null, 2))
  const wins = results.filter((result) => result.status === 201)
  const losses = results.filter((result) => result.status === 409)
  if (wins.length !== 1 || losses.length !== 1) {
    throw new Error(`expected one 201 and one 409, got ${results.map((result) => result.status).join(', ')}`)
  }
  const lost = losses[0]?.body as { ok?: boolean; error?: { code?: string; seatIds?: string[]; message?: string } }
  if (lost.ok !== false || lost.error?.code !== 'SEAT_TAKEN' || lost.error.message !== seatTakenMessage(['A1'])) {
    throw new Error('loser was not SEAT_TAKEN for A1')
  }
  if (!Array.isArray(lost.error.seatIds) || lost.error.seatIds.join(',') !== 'A1') {
    throw new Error('SEAT_TAKEN did not list A1')
  }
  const count = await pool.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM seat_occupancy WHERE show_id = $1 AND seat_id = 'A1'`,
    [showId],
  )
  const holds = await pool.query<{ n: string }>(`SELECT count(*)::int AS n FROM holds WHERE show_id = $1`, [showId])
  if (Number(count.rows[0]?.n) !== 1 || Number(holds.rows[0]?.n) !== 1) {
    throw new Error('database did not keep exactly one hold on A1')
  }
  console.log('concurrency ok: exactly one hold won')
}

main()
  .then(() => reset())
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(safeMessage(err))
    try {
      await reset()
    } catch {
      /* ignore */
    }
    await pool.end()
    process.exit(1)
  })
