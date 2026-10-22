import pg from 'pg'
import { config } from './config.ts'

const { Pool } = pg

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  application_name: 'cinema-api',
})

pool.on('error', (err) => {
  console.error('database pool error')
  console.error(err.message)
})

export type Db = pg.Pool | pg.PoolClient

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* the connection may already be closing */
    }
    throw err
  } finally {
    client.release()
  }
}
