import type { Response } from 'express'
import { ApiFailureSchema, ERROR_MESSAGE, ERROR_STATUS, seatTakenMessage, type ErrorCode } from './contract.ts'
import { sendJson, NO_STORE } from './http.ts'

export class ApiException extends Error {
  readonly code: ErrorCode
  readonly fields?: Record<string, string>
  readonly seatIds?: string[]

  constructor(
    code: ErrorCode,
    opts?: { message?: string; fields?: Record<string, string>; seatIds?: string[] },
  ) {
    if (code === 'SEAT_TAKEN' && (!opts?.seatIds || opts.seatIds.length === 0)) {
      throw new Error('SEAT_TAKEN requires seatIds')
    }
    const message =
      opts?.message ??
      (code === 'SEAT_TAKEN' ? seatTakenMessage(opts?.seatIds ?? []) : ERROR_MESSAGE[code])
    super(message)
    this.name = 'ApiException'
    this.code = code
    this.fields = opts?.fields
    this.seatIds = opts?.seatIds
  }
}

export function errorBody(err: ApiException): { ok: false; error: Record<string, unknown> } {
  const error: Record<string, unknown> = { code: err.code, message: err.message }
  if (err.fields && Object.keys(err.fields).length > 0) error.fields = err.fields
  if (err.code === 'SEAT_TAKEN') error.seatIds = err.seatIds
  return ApiFailureSchema.parse({ ok: false, error })
}

export function sendError(res: Response, err: ApiException): void {
  sendJson(res, ERROR_STATUS[err.code], errorBody(err), NO_STORE)
}

export function isJsonParseError(err: unknown): boolean {
  if (!(err instanceof SyntaxError)) return false
  const extra = err as SyntaxError & { status?: number; type?: string }
  return extra.status === 400 && extra.type === 'entity.parse.failed'
}

export function isBodyTooLarge(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const extra = err as { type?: string; status?: number }
  return extra.type === 'entity.too.large' || extra.status === 413
}
