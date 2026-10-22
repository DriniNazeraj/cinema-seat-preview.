import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pool } from '../src/db.ts'
import { safeMessage } from '../src/util.ts'

const seedPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/seed.sql')

export async function seed(): Promise<void> {
  const sql = await readFile(seedPath, 'utf8')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(sql)
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
  console.log('seed applied')
}

function isDirectRun(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isDirectRun()) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error(safeMessage(err))
      pool.end().finally(() => process.exit(1))
    })
}
