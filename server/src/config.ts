import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_CINEMA_TZ } from '../../src/lib/api-contract.ts'

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(serverRoot, '.env'), quiet: true })

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function holdSeconds(): number {
  const raw = process.env.HOLD_SECONDS
  if (raw === undefined || raw.trim() === '') return 600
  if (!/^[1-9]\d*$/.test(raw.trim())) {
    throw new Error('HOLD_SECONDS must be a positive integer')
  }
  const value = Number(raw.trim())
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('HOLD_SECONDS must be a positive integer')
  }
  return value
}

function port(): number {
  const raw = process.env.PORT
  if (raw === undefined || raw.trim() === '') return 3000
  if (!/^\d+$/.test(raw.trim())) throw new Error('PORT must be an integer from 1 to 65535')
  const value = Number(raw.trim())
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535')
  }
  return value
}

function cinemaTz(): string {
  const zone = process.env.CINEMA_TZ?.trim() || DEFAULT_CINEMA_TZ
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date())
  } catch {
    throw new Error('CINEMA_TZ must be an IANA time zone name')
  }
  return zone
}

/** Hop count. 0 trusts no proxy, so req.ip is the socket address. */
function trustProxy(): number {
  const raw = process.env.TRUST_PROXY
  if (raw === undefined || raw.trim() === '') return 0
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error('TRUST_PROXY must be a non-negative integer hop count')
  }
  const value = Number(raw.trim())
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('TRUST_PROXY must be a non-negative integer hop count')
  }
  return value
}

function corsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173'
  const origins = raw.split(',').map((origin) => origin.trim()).filter(Boolean)
  if (origins.length === 0) throw new Error('CORS_ORIGIN must list at least one origin')
  return origins
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  port: port(),
  corsOrigins: corsOrigins(),
  cinemaTz: cinemaTz(),
  holdSeconds: holdSeconds(),
  trustProxy: trustProxy(),
}

export const serverDir = serverRoot
