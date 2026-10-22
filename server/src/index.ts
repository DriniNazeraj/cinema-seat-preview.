import { createApp } from './app.ts'
import { config } from './config.ts'
import { pool } from './db.ts'
import { startSweeper } from './sweeper.ts'
import { safeMessage } from './util.ts'

async function main(): Promise<void> {
  try {
    await pool.query('SELECT 1')
  } catch (err) {
    console.error(`database connection failed: ${safeMessage(err)}`)
    process.exit(1)
  }

  const stopSweeper = startSweeper()
  const server = createApp().listen(config.port, () => {
    console.log(
      `cinema api listening on port ${config.port} (tz ${config.cinemaTz}, hold ${config.holdSeconds}s)`,
    )
  })

  async function shutdown(): Promise<void> {
    stopSweeper()
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
    await pool.end()
  }

  process.on('SIGINT', () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(safeMessage(err))
        process.exit(1)
      })
  })
  process.on('SIGTERM', () => {
    shutdown()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(safeMessage(err))
        process.exit(1)
      })
  })
}

main().catch((err) => {
  console.error(safeMessage(err))
  process.exit(1)
})
