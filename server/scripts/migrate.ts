import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pool } from '../src/db.ts'
import { safeMessage } from '../src/util.ts'

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations')

export async function migrate(): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()
  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file])
    if ((done.rowCount ?? 0) > 0) {
      console.log(`migration ${file} already applied`)
      continue
    }
    const sql = await readFile(path.join(migrationsDir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`migration ${file} applied`)
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
}

function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isDirectRun()) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(safeMessage(err))
      pool.end().finally(() => process.exit(1))
    })
}
