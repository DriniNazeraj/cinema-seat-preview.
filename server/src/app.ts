import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { config } from './config.ts'
import {
  BookingResponseSchema,
  CreateBookingBodySchema,
  CreateHoldBodySchema,
  ERROR_MESSAGE,
  GetMovieResponseSchema,
  GetSeatMapResponseSchema,
  GetShowResponseSchema,
  HoldResponseSchema,
  ListMoviesResponseSchema,
  ListShowsQuerySchema,
  ListShowsResponseSchema,
  RATE_LIMITS,
  ReleaseHoldResponseSchema,
  SeatMapQuerySchema,
} from './contract.ts'
import { getMovie, getSeatMap, getShow, listMovies, listShows } from './catalog.ts'
import { confirmBooking, createBooking, readBooking } from './bookings.ts'
import { withTransaction } from './db.ts'
import { ApiException, isBodyTooLarge, isJsonParseError, sendError } from './errors.ts'
import { asyncHandler, CATALOG_CACHE, NO_STORE, sendJson, sendOk } from './http.ts'
import { BOOKING_ROUTE, HOLD_ROUTE, requestHash, runIdempotent } from './idempotency.ts'
import { createHold, refreshHold, releaseHold } from './holds.ts'
import { makeLimiter } from './rate-limit.ts'
import { blankToUndefined, parseSchema } from './validate.ts'
import { safeMessage } from './util.ts'

function idempotencyKey(req: Request): string | null {
  const header = req.get('Idempotency-Key')
  if (header === undefined) return null
  if (header.length < 8 || header.length > 200) {
    throw new ApiException('VALIDATION_ERROR', {
      fields: { 'Idempotency-Key': 'Idempotency-Key must be 8 to 200 characters.' },
    })
  }
  return header
}

function isResponseSchemaError(err: unknown): err is { issues: unknown[] } {
  return typeof err === 'object' && err !== null && 'issues' in err && Array.isArray((err as { issues: unknown }).issues)
}

export function createApp() {
  const app = express()
  // Hop count, not `true`, so the rate limiter can use the proxy's client address
  // without accepting an arbitrary forwarded chain from the open internet.
  app.set('trust proxy', 1)
  app.set('etag', false)
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: false,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Idempotency-Key'],
      exposedHeaders: ['Retry-After', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'RateLimit-Policy'],
    }),
  )
  app.use(express.json({ limit: '32kb' }))

  const holdCreateLimit = makeLimiter(RATE_LIMITS.holdCreate.limit, RATE_LIMITS.holdCreate.windowMs)
  const holdRefreshLimit = makeLimiter(RATE_LIMITS.holdRefresh.limit, RATE_LIMITS.holdRefresh.windowMs)
  const holdReleaseLimit = makeLimiter(RATE_LIMITS.holdRelease.limit, RATE_LIMITS.holdRelease.windowMs)
  const bookingCreateLimit = makeLimiter(RATE_LIMITS.bookingCreate.limit, RATE_LIMITS.bookingCreate.windowMs)
  const bookingConfirmLimit = makeLimiter(RATE_LIMITS.bookingConfirm.limit, RATE_LIMITS.bookingConfirm.windowMs)

  app.get(
    '/api/movies',
    asyncHandler(async (_req, res) => {
      const movies = await withTransaction(listMovies)
      sendOk(res, 200, ListMoviesResponseSchema, movies, CATALOG_CACHE)
    }),
  )

  app.get(
    '/api/movies/:id',
    asyncHandler(async (req, res) => {
      const movie = await withTransaction((client) => getMovie(client, req.params.id))
      sendOk(res, 200, GetMovieResponseSchema, movie, CATALOG_CACHE)
    }),
  )

  app.get(
    '/api/shows',
    asyncHandler(async (req, res) => {
      const query = parseSchema(ListShowsQuerySchema, req.query)
      const shows = await withTransaction((client) => listShows(client, query.movieId, query.date))
      sendOk(res, 200, ListShowsResponseSchema, shows, CATALOG_CACHE)
    }),
  )

  app.get(
    '/api/shows/:id/seat-map',
    asyncHandler(async (req, res) => {
      const query = parseSchema(SeatMapQuerySchema, req.query)
      const map = await withTransaction((client) => getSeatMap(client, req.params.id, query.holdId))
      sendOk(res, 200, GetSeatMapResponseSchema, map, NO_STORE)
    }),
  )

  app.get(
    '/api/shows/:id',
    asyncHandler(async (req, res) => {
      const show = await withTransaction((client) => getShow(client, req.params.id))
      sendOk(res, 200, GetShowResponseSchema, show, CATALOG_CACHE)
    }),
  )

  app.post(
    '/api/holds',
    holdCreateLimit,
    asyncHandler(async (req, res) => {
      const key = idempotencyKey(req)
      const body = parseSchema(CreateHoldBodySchema, req.body)
      const result = await withTransaction((client) =>
        runIdempotent(client, HOLD_ROUTE, key, requestHash(body), async (tx) => {
          const hold = await createHold(tx, body)
          return { status: 201, body: HoldResponseSchema.parse({ ok: true, data: hold }) }
        }),
      )
      sendJson(res, result.status, result.body, NO_STORE)
    }),
  )

  app.post(
    '/api/holds/:id/refresh',
    holdRefreshLimit,
    asyncHandler(async (req, res) => {
      const hold = await withTransaction((client) => refreshHold(client, req.params.id))
      sendOk(res, 200, HoldResponseSchema, hold, NO_STORE)
    }),
  )

  app.delete(
    '/api/holds/:id',
    holdReleaseLimit,
    asyncHandler(async (req, res) => {
      const released = await withTransaction((client) => releaseHold(client, req.params.id))
      sendOk(res, 200, ReleaseHoldResponseSchema, released, NO_STORE)
    }),
  )

  app.post(
    '/api/bookings',
    bookingCreateLimit,
    asyncHandler(async (req, res) => {
      const key = idempotencyKey(req)
      const parsed = parseSchema(CreateBookingBodySchema, req.body, true)
      const phone = blankToUndefined(parsed.phone)
      const body = {
        holdId: parsed.holdId,
        name: parsed.name,
        email: parsed.email,
        ...(phone ? { phone } : {}),
        tickets: parsed.tickets,
      }
      const result = await withTransaction((client) =>
        runIdempotent(client, BOOKING_ROUTE, key, requestHash(body), async (tx) => {
          const outcome = await createBooking(tx, body)
          if (!outcome.ok) throw outcome.error
          return { status: outcome.status, body: BookingResponseSchema.parse({ ok: true, data: outcome.data }) }
        }),
      )
      sendJson(res, result.status, result.body, NO_STORE)
    }),
  )

  app.post(
    '/api/bookings/:ref/confirm',
    bookingConfirmLimit,
    asyncHandler(async (req, res) => {
      const outcome = await withTransaction((client) => confirmBooking(client, req.params.ref))
      if (!outcome.ok) {
        sendError(res, outcome.error)
        return
      }
      sendOk(res, outcome.status, BookingResponseSchema, outcome.data, NO_STORE)
    }),
  )

  app.get(
    '/api/bookings/:ref',
    asyncHandler(async (req, res) => {
      const booking = await withTransaction((client) => readBooking(client, req.params.ref))
      sendOk(res, 200, BookingResponseSchema, booking, NO_STORE)
    }),
  )

  app.use((_req, res) => {
    sendError(res, new ApiException('NOT_FOUND'))
  })

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err)
      return
    }
    if (err instanceof ApiException) {
      sendError(res, err)
      return
    }
    if (isJsonParseError(err)) {
      sendError(res, new ApiException('VALIDATION_ERROR', { fields: { body: 'Malformed JSON.' } }))
      return
    }
    if (isBodyTooLarge(err)) {
      sendError(res, new ApiException('VALIDATION_ERROR', { fields: { body: 'Request body is too large.' } }))
      return
    }
    if (isResponseSchemaError(err)) {
      console.error(`response validation failed: ${JSON.stringify(err.issues).slice(0, 2000)}`)
    } else {
      console.error(safeMessage(err))
    }
    sendJson(res, 500, { ok: false, error: { code: 'INTERNAL', message: ERROR_MESSAGE.INTERNAL } }, NO_STORE)
  })

  return app
}
