import { createHash } from 'node:crypto'
import type pg from 'pg'
import { ERROR_STATUS } from './contract.ts'
import { ApiException, errorBody } from './errors.ts'

export const HOLD_ROUTE = 'POST /api/holds'
export const BOOKING_ROUTE = 'POST /api/bookings'

export type IdempotentResult = { status: number; body: unknown }

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item))
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) sorted[key] = canonicalize(source[key])
    return sorted
  }
  return value
}

export function requestHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(body))).digest('hex')
}

/**
 * Runs `fn` in the open transaction. When `key` is set, the same key and body
 * replay the stored response. The same key and a different body is CONFLICT.
 * A business error is stored too, after rolling the business writes back to a
 * savepoint, so a retry does not repeat a failed hold or booking.
 */
export async function runIdempotent(
  client: pg.PoolClient,
  route: string,
  key: string | null,
  hash: string,
  fn: (client: pg.PoolClient) => Promise<IdempotentResult>,
): Promise<IdempotentResult> {
  if (!key) return fn(client)

  const inserted = await client.query<{ key: string }>(
    `INSERT INTO idempotency_keys (key, route, request_hash, status_code, response_body)
     VALUES ($1, $2, $3, 0, '{}'::jsonb)
     ON CONFLICT (key, route) DO NOTHING
     RETURNING key`,
    [key, route, hash],
  )
  if ((inserted.rowCount ?? 0) === 0) {
    const existing = await client.query<{ request_hash: string; status_code: number; response_body: unknown }>(
      `SELECT request_hash, status_code, response_body
       FROM idempotency_keys
       WHERE key = $1 AND route = $2`,
      [key, route],
    )
    const row = existing.rows[0]
    if (!row || row.status_code === 0) throw new Error('idempotency record is incomplete')
    if (row.request_hash !== hash) throw new ApiException('CONFLICT')
    return { status: row.status_code, body: row.response_body }
  }

  await client.query('SAVEPOINT business')
  try {
    const result = await fn(client)
    await storeResult(client, route, key, result.status, result.body)
    return result
  } catch (err) {
    if (err instanceof ApiException) {
      await client.query('ROLLBACK TO SAVEPOINT business')
      const status = ERROR_STATUS[err.code]
      const body = errorBody(err)
      await storeResult(client, route, key, status, body)
      return { status, body }
    }
    throw err
  }
}

async function storeResult(client: pg.PoolClient, route: string, key: string, status: number, body: unknown): Promise<void> {
  await client.query(
    `UPDATE idempotency_keys
     SET status_code = $3, response_body = $4::jsonb
     WHERE key = $1 AND route = $2`,
    [key, route, status, JSON.stringify(body)],
  )
}
