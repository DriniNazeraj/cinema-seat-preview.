import { pool } from './db.ts'
import { safeMessage } from './util.ts'

const SWEEP_MS = 30_000

/**
 * Deletes expired hold occupancy and marks pending bookings expired.
 * Reads and the hold transaction do not depend on this job.
 * The holds row is kept so a late refresh is HOLD_EXPIRED, not NOT_FOUND.
 */
export async function sweep(): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE bookings AS b
       SET status = 'expired'
       FROM holds AS h
       WHERE b.hold_id = h.id
         AND b.status = 'pending'
         AND h.released_at IS NULL
         AND h.consumed_at IS NULL
         AND h.expires_at <= now()`,
    )
    await client.query(
      `DELETE FROM seat_occupancy
       WHERE kind = 'hold' AND expires_at <= now()`,
    )
    await client.query('COMMIT')
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw err
  } finally {
    client.release()
  }
}

export function startSweeper(): () => void {
  const run = () => {
    sweep().catch((err) => {
      console.error(`sweeper failed: ${safeMessage(err)}`)
    })
  }
  run()
  const timer = setInterval(run, SWEEP_MS)
  timer.unref()
  return () => clearInterval(timer)
}
