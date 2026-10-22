import rateLimit from 'express-rate-limit'
import type { RequestHandler } from 'express'
import { ERROR_MESSAGE, ERROR_STATUS } from './contract.ts'
import { NO_STORE, sendJson } from './http.ts'

/**
 * Separate in-memory bucket per route, keyed by client IP.
 * `trust proxy` is a hop count (not `true`) so the limiter will use the
 * proxy-provided address. Headers are the named RateLimit-* fields plus
 * Retry-After on 429. express-rate-limit calls that header set draft-6; the
 * contract asks for those same field names.
 */
export function makeLimiter(limit: number, windowMs: number): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler: (_req, res) => {
      sendJson(
        res,
        ERROR_STATUS.RATE_LIMITED,
        { ok: false, error: { code: 'RATE_LIMITED', message: ERROR_MESSAGE.RATE_LIMITED } },
        NO_STORE,
      )
    },
  })
}
