import { config } from './config.ts'

/** ISO-8601 UTC, the same string `Date#toISOString()` produces. */
export function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid timestamp from database')
  return date.toISOString()
}

export function int(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(number)) throw new Error(`Expected an integer for ${label}`)
  return number
}

export function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const seen = new Set(right)
  return left.every((id) => seen.has(id))
}

export function safeMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : 'unknown error'
  const secret = config.databaseUrl
  return secret ? message.split(secret).join('[redacted]') : message
}

export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code
  }
  return undefined
}

export function pgConstraint(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'constraint' in err && typeof err.constraint === 'string') {
    return err.constraint
  }
  return undefined
}
