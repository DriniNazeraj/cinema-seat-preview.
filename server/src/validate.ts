import { CHILD_ONLY_MESSAGE } from './contract.ts'
import { ApiException } from './errors.ts'

type Issue = { path?: PropertyKey[]; message?: string }
type Parsed<T> = { success: true; data: T } | { success: false; error: { issues: Issue[] } }

export function zodFields(issues: readonly Issue[]): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of issues) {
    const path = issue.path ?? []
    const key = path.length ? path.map((part) => String(part)).join('.') : 'body'
    if (!(key in fields)) fields[key] = issue.message || 'Invalid value'
  }
  return fields
}

function isChildOnly(issues: readonly Issue[]): boolean {
  return issues.length > 0 && issues.every((issue) => issue.message === CHILD_ONLY_MESSAGE)
}

export function parseSchema<T>(schema: { safeParse: (data: unknown) => Parsed<T> }, value: unknown, childOnly = false): T {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  if (childOnly && isChildOnly(result.error.issues)) {
    throw new ApiException('CHILD_ONLY_BOOKING', { fields: { tickets: CHILD_ONLY_MESSAGE } })
  }
  throw new ApiException('VALIDATION_ERROR', { fields: zodFields(result.error.issues) })
}

/** Blank phone is the same as leaving it out. */
export function blankToUndefined(phone: string | undefined): string | undefined {
  if (phone === undefined) return undefined
  const trimmed = phone.trim()
  return trimmed.length ? trimmed : undefined
}
