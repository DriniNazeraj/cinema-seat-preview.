/**
 * HTTP contract shared by the Vite front end and the future Express server.
 * Zod only — do not import express, pg, or anything else server-side here.
 *
 * MovieSchema, ShowSchema, SeatSchema, SeatMapSchema, BookingInputSchema, and
 * BookingSchema are the same schemas as src/lib/api.ts. That file keeps its
 * own copy so the client bundle does not import this module. New booking,
 * hold, and money shapes live beside them. Human-readable contract: docs/api.md.
 */
import { z } from 'zod'

/** Default hold length. The server may override this with env HOLD_SECONDS. Clients display `holdExpiresAt`, not a locally computed deadline. */
export const HOLD_SECONDS = 600
export const MAX_SEATS = 8
export const CURRENCY = 'EUR' as const
/** Calendar dates on `GET /api/shows?date=` use this zone unless env CINEMA_TZ overrides it. */
export const DEFAULT_CINEMA_TZ = 'Europe/Berlin'
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

// ---------------------------------------------------------------- mock schemas
// Copied from the front-end mock. Field names and constraints stay put so the
// existing fetchers can keep parsing `data` with these schemas.

export const MovieSchema = z.object({
  id: z.string(),
  title: z.string(),
  tagline: z.string(),
  runtime: z.number().int(), // minutes
  rating: z.string(),
  genres: z.array(z.string()),
  synopsis: z.string(),
  /** two hex colours used to paint a generated placeholder poster */
  palette: z.tuple([z.string(), z.string()]),
  placeholder: z.literal(true),
})
export type Movie = z.infer<typeof MovieSchema>

export const ShowFormat = z.enum(['2D', '3D', 'IMAX'])
export const ShowSchema = z.object({
  id: z.string(),
  movieId: z.string(),
  start: z.string(), // ISO datetime
  format: ShowFormat,
  hallId: z.string(),
  price: z.number(), // EUR per seat [PH]
  soldOut: z.boolean(),
})
export type Show = z.infer<typeof ShowSchema>

/** Stable seat id: row letter + seat number, e.g. "A12" */
export const SeatId = z.string().regex(/^[A-Z]\d{1,2}$/)
export const SeatSchema = z.object({
  id: SeatId,
  row: z.string().length(1),
  n: z.number().int(),
  /** column index in the grid incl. aisle gaps */
  x: z.number().int(),
  type: z.enum(['std', 'access']),
})
export type Seat = z.infer<typeof SeatSchema>

export const HallSchema = z.object({
  id: z.string(),
  name: z.string(),
  columns: z.number().int(),
  rows: z.array(z.object({ label: z.string(), seats: z.array(SeatSchema) })),
})
export type Hall = z.infer<typeof HallSchema>

export const SeatMapSchema = z.object({
  show: ShowSchema,
  hall: HallSchema,
  taken: z.array(SeatId),
})
export type SeatMap = z.infer<typeof SeatMapSchema>

export const BookingInputSchema = z.object({
  showId: z.string(),
  seats: z.array(SeatId).min(1).max(8), // 8 === MAX_SEATS
  name: z.string().trim().min(2, 'Please enter your name'),
  email: z.string().trim().email('Please enter a valid email'),
  phone: z.string().trim().optional(),
})
export type BookingInput = z.infer<typeof BookingInputSchema>

export const BookingSchema = BookingInputSchema.extend({
  ref: z.string(),
  total: z.number(),
  createdAt: z.string(),
  placeholder: z.literal(true),
})
export type Booking = z.infer<typeof BookingSchema>

// ---------------------------------------------------------------- money and tickets

/** Adult, child, and disabled. There is no senior type. */
export const TicketTypeSchema = z.enum(['adult', 'child', 'disabled'])
export type TicketType = z.infer<typeof TicketTypeSchema>

/**
 * Placeholder tariff in integer cents. Same for every format.
 * Not a real price list. [PH]
 */
export const PLACEHOLDER_TICKET_PRICES = {
  adult: 1200,
  child: 800,
  disabled: 800,
} as const satisfies Record<TicketType, number>

/**
 * Ticket types that satisfy the at-least-one rule. Child does not.
 * This array is the whole rule.
 */
export const COUNTS_AS_ADULT = ['adult', 'disabled'] as const satisfies readonly TicketType[]

export function countsAsAdult(tickets: readonly { ticketType: string }[]): boolean {
  return tickets.some((ticket) => (COUNTS_AS_ADULT as readonly string[]).includes(ticket.ticketType))
}

/** Authoritative price. Integer cents, never a float. */
export const TicketPriceSchema = z.object({
  ticketType: TicketTypeSchema,
  priceCents: z.number().int().nonnegative(),
  currency: z.literal(CURRENCY),
})
export type TicketPrice = z.infer<typeof TicketPriceSchema>

export const CHILD_ONLY_MESSAGE = 'A booking must include at least one adult or disabled ticket.'
export const ACCESS_SEAT_MISMATCH_MESSAGE =
  'The number of access seats must equal the number of disabled tickets.'

/**
 * Show JSON on the wire. `price` stays the mock field (adult price in euros,
 * so `eur(show.price)` keeps working). `ticketPrices` is the source of truth.
 */
export const ShowResponseSchema = ShowSchema.extend({
  currency: z.literal(CURRENCY),
  ticketPrices: z.array(TicketPriceSchema).length(3),
}).superRefine((show, ctx) => {
  const adult = show.ticketPrices.find((t) => t.ticketType === 'adult')
  const child = show.ticketPrices.find((t) => t.ticketType === 'child')
  const disabled = show.ticketPrices.find((t) => t.ticketType === 'disabled')
  if (!adult || !child || !disabled) {
    ctx.addIssue({
      code: 'custom',
      message: 'ticketPrices must include one adult, one child, and one disabled price',
      path: ['ticketPrices'],
    })
    return
  }
  if (Math.round(show.price * 100) !== adult.priceCents) {
    ctx.addIssue({
      code: 'custom',
      message: 'price is the adult price in euros and must equal adult priceCents / 100',
      path: ['price'],
    })
  }
})
export type ShowResponse = z.infer<typeof ShowResponseSchema>

// ---------------------------------------------------------------- seat map

export const SeatKindSchema = z.enum(['standard', 'access', 'companion'])
export type SeatKind = z.infer<typeof SeatKindSchema>

export const SeatStatusSchema = z.enum(['available', 'held', 'booked'])
export type SeatStatus = z.infer<typeof SeatStatusSchema>

export const SeatStatusEntrySchema = z.object({
  seatId: SeatId,
  status: SeatStatusSchema,
})

/**
 * Seat-map JSON. Parses with SeatMapSchema if `statuses` is stripped.
 * `taken` is what the current UI reads. `statuses` is the full picture:
 * available, held, and booked. A held seat may be left out of `taken` when
 * it belongs to the `holdId` query (the caller's own hold).
 */
export const SeatMapResponseSchema = SeatMapSchema.extend({
  show: ShowResponseSchema,
  hall: HallSchema.extend({
    rows: z.array(z.object({
      label: z.string(),
      seats: z.array(SeatSchema.extend({ kind: SeatKindSchema })),
    })),
  }),
  statuses: z.array(SeatStatusEntrySchema),
}).superRefine((map, ctx) => {
  const hallIds: string[] = []
  for (const row of map.hall.rows) {
    for (const seat of row.seats) {
      hallIds.push(seat.id)
      if (seat.row !== row.label) {
        ctx.addIssue({ code: 'custom', message: 'seat.row must match its row label', path: ['hall'] })
      }
      if (seat.id !== `${seat.row}${seat.n}`) {
        ctx.addIssue({ code: 'custom', message: 'seat id must be the row letter plus n', path: ['hall'] })
      }
    }
  }
  if (new Set(hallIds).size !== hallIds.length) {
    ctx.addIssue({ code: 'custom', message: 'seat ids must be unique in the hall', path: ['hall'] })
  }
  const hallSet = new Set(hallIds)
  const statusIds = map.statuses.map((s) => s.seatId)
  if (statusIds.length !== hallIds.length || new Set(statusIds).size !== hallIds.length || statusIds.some((id) => !hallSet.has(id))) {
    ctx.addIssue({ code: 'custom', message: 'statuses must list each hall seat once', path: ['statuses'] })
  }
  const byId = new Map(map.statuses.map((s) => [s.seatId, s.status]))
  const taken = new Set(map.taken)
  for (const id of taken) {
    const status = byId.get(id)
    if (status !== 'held' && status !== 'booked') {
      ctx.addIssue({ code: 'custom', message: 'every taken seat is held or booked', path: ['taken'] })
      break
    }
  }
  for (const [id, status] of byId) {
    if (status === 'available' && taken.has(id)) {
      ctx.addIssue({ code: 'custom', message: 'available seats are not taken', path: ['taken'] })
      break
    }
    if (status === 'booked' && !taken.has(id)) {
      ctx.addIssue({ code: 'custom', message: 'booked seats are taken', path: ['taken'] })
      break
    }
  }
})
export type SeatMapResponse = z.infer<typeof SeatMapResponseSchema>

// ---------------------------------------------------------------- holds

/** ISO-8601 instant, e.g. `new Date().toISOString()`. */
export const IsoDateTime = z.iso.datetime()
export const HoldId = z.uuid()
/** Public booking id. 128-bit random hex, prefixed so it stays a `ref` string. */
export const BookingRef = z.string().regex(/^LUM-[0-9A-F]{32}$/)

export const CreateHoldBodySchema = z
  .object({
    showId: z.string().min(1),
    seats: z.array(SeatId).min(1, 'Pick at least one seat.').max(MAX_SEATS, 'You can book up to 8 seats at once.'),
  })
  .superRefine((body, ctx) => {
    if (duplicateIds(body.seats).length) {
      ctx.addIssue({ code: 'custom', message: 'Seats must be unique.', path: ['seats'] })
    }
  })
export type CreateHoldBody = z.infer<typeof CreateHoldBodySchema>

export const HoldSchema = z
  .object({
    id: HoldId,
    showId: z.string().min(1),
    seats: z.array(SeatId).min(1).max(MAX_SEATS),
    /** When this hold stops reserving the seats. Present on every hold response. */
    holdExpiresAt: IsoDateTime,
    createdAt: IsoDateTime,
  })
  .superRefine((hold, ctx) => {
    if (duplicateIds(hold.seats).length) {
      ctx.addIssue({ code: 'custom', message: 'Seats must be unique.', path: ['seats'] })
    }
  })
export type Hold = z.infer<typeof HoldSchema>

export const ReleasedHoldSchema = z.object({
  id: HoldId,
  released: z.literal(true),
  /** The expiry the hold had. Still present after release. */
  holdExpiresAt: IsoDateTime,
})
export type ReleasedHold = z.infer<typeof ReleasedHoldSchema>

// ---------------------------------------------------------------- bookings

export const TicketSelectionSchema = z.object({
  seatId: SeatId,
  ticketType: TicketTypeSchema,
})
export type TicketSelection = z.infer<typeof TicketSelectionSchema>

export const CreateBookingBodySchema = z
  .object({
    holdId: HoldId,
    name: z.string().trim().min(2, 'Please enter your name'),
    email: z.string().trim().email('Please enter a valid email'),
    phone: z.string().trim().optional(),
    tickets: z.array(TicketSelectionSchema).min(1).max(MAX_SEATS, 'You can book up to 8 seats at once.'),
  })
  .superRefine((body, ctx) => {
    const ids = body.tickets.map((t) => t.seatId)
    if (duplicateIds(ids).length) {
      ctx.addIssue({ code: 'custom', message: 'Seats must be unique.', path: ['tickets'] })
    }
    if (!countsAsAdult(body.tickets)) {
      ctx.addIssue({ code: 'custom', message: CHILD_ONLY_MESSAGE, path: ['tickets'] })
    }
  })
export type CreateBookingBody = z.infer<typeof CreateBookingBodySchema>

export const BookingTicketSchema = z.object({
  seatId: SeatId,
  ticketType: TicketTypeSchema,
  priceCents: z.number().int().nonnegative(),
})
export type BookingTicket = z.infer<typeof BookingTicketSchema>

export const BookingStatusSchema = z.enum(['pending', 'confirmed', 'expired', 'cancelled'])
export type BookingStatus = z.infer<typeof BookingStatusSchema>

/**
 * Booking JSON. Not the mock BookingSchema: there is no `placeholder` flag,
 * and `total` is integer cents (the mock stores euros). `seats` is still the
 * list of seat ids the confirmed page renders.
 */
export const BookingRecordSchema = z
  .object({
    ref: BookingRef,
    showId: z.string().min(1),
    seats: z.array(SeatId).min(1).max(MAX_SEATS),
    name: z.string().min(1),
    email: z.string().min(1),
    phone: z.string().optional(),
    /** Integer cents. The mock's `total` is euros; see docs/api.md. */
    total: z.number().int().nonnegative(),
    currency: z.literal(CURRENCY),
    createdAt: IsoDateTime,
    status: BookingStatusSchema,
    holdId: HoldId,
    tickets: z.array(BookingTicketSchema).min(1).max(MAX_SEATS),
    /** Present while status is `pending`, so the timer can follow the server. */
    holdExpiresAt: IsoDateTime.optional(),
    confirmedAt: IsoDateTime.optional(),
  })
  .superRefine((booking, ctx) => {
    const ids = booking.tickets.map((t) => t.seatId)
    if (duplicateIds(ids).length || !sameIds(ids, booking.seats)) {
      ctx.addIssue({ code: 'custom', message: 'seats must be the ticket seat ids', path: ['seats'] })
    }
    if (!countsAsAdult(booking.tickets)) {
      ctx.addIssue({ code: 'custom', message: CHILD_ONLY_MESSAGE, path: ['tickets'] })
    }
    const sum = booking.tickets.reduce((n, t) => n + t.priceCents, 0)
    if (sum !== booking.total) {
      ctx.addIssue({ code: 'custom', message: 'total must equal the sum of ticket priceCents', path: ['total'] })
    }
    if (booking.status === 'pending' && !booking.holdExpiresAt) {
      ctx.addIssue({ code: 'custom', message: 'a pending booking includes holdExpiresAt', path: ['holdExpiresAt'] })
    }
    if (booking.status !== 'pending' && booking.holdExpiresAt) {
      ctx.addIssue({ code: 'custom', message: 'holdExpiresAt is only present while the booking is pending', path: ['holdExpiresAt'] })
    }
    if (booking.status === 'confirmed' && !booking.confirmedAt) {
      ctx.addIssue({ code: 'custom', message: 'a confirmed booking includes confirmedAt', path: ['confirmedAt'] })
    }
  })
export type BookingRecord = z.infer<typeof BookingRecordSchema>

// ---------------------------------------------------------------- queries

export const DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const ListShowsQuerySchema = z.object({
  movieId: z.string().min(1).optional(),
  date: DateKey.optional(),
})
export type ListShowsQuery = z.infer<typeof ListShowsQuerySchema>

export const SeatMapQuerySchema = z.object({
  holdId: HoldId.optional(),
})
export type SeatMapQuery = z.infer<typeof SeatMapQuerySchema>

// ---------------------------------------------------------------- errors

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'SEAT_TAKEN',
  'HOLD_EXPIRED',
  'HOLD_CONSUMED',
  'HOLD_SEAT_MISMATCH',
  'CHILD_ONLY_BOOKING',
  'ACCESS_SEAT_MISMATCH',
  'SHOW_SOLD_OUT',
  'BOOKING_NOT_CONFIRMABLE',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'UNAVAILABLE',
  'INTERNAL',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  SEAT_TAKEN: 409,
  HOLD_EXPIRED: 409,
  HOLD_CONSUMED: 409,
  HOLD_SEAT_MISMATCH: 409,
  CHILD_ONLY_BOOKING: 422,
  ACCESS_SEAT_MISMATCH: 422,
  SHOW_SOLD_OUT: 409,
  BOOKING_NOT_CONFIRMABLE: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNAVAILABLE: 503,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>

/** Mock throw text, with the taken ids appended. `error.seatIds` still carries the list. */
export function seatTakenMessage(seatIds: readonly string[]): string {
  return `Seat(s) no longer free: ${seatIds.join(', ')}.`
}

export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Please check the form.',
  NOT_FOUND: 'Not found.',
  SEAT_TAKEN: 'Seat(s) no longer free.',
  HOLD_EXPIRED: 'That hold has expired.',
  HOLD_CONSUMED: 'That hold was already used.',
  HOLD_SEAT_MISMATCH: 'Those seats do not match the hold.',
  CHILD_ONLY_BOOKING: CHILD_ONLY_MESSAGE,
  ACCESS_SEAT_MISMATCH: ACCESS_SEAT_MISMATCH_MESSAGE,
  SHOW_SOLD_OUT: 'This show is sold out.',
  BOOKING_NOT_CONFIRMABLE: 'This booking can no longer be confirmed.',
  CONFLICT: 'That request conflicts with the current booking.',
  RATE_LIMITED: 'Too many requests. Try again shortly.',
  PAYLOAD_TOO_LARGE: 'Request body is too large.',
  UNAVAILABLE: 'Service unavailable.',
  INTERNAL: 'Something went wrong.',
}

const errorFields = z.record(z.string(), z.string()).optional()
const errorMessage = z.string().min(1)

function simpleError<C extends Exclude<ErrorCode, 'SEAT_TAKEN'>>(code: C) {
  return z.object({
    code: z.literal(code),
    message: errorMessage,
    fields: errorFields,
  })
}

export const ApiErrorSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('SEAT_TAKEN'),
    message: errorMessage,
    /** Seats that were already held or booked. Always at least one. */
    seatIds: z.array(SeatId).min(1),
    fields: errorFields,
  }),
  simpleError('VALIDATION_ERROR'),
  simpleError('NOT_FOUND'),
  simpleError('HOLD_EXPIRED'),
  simpleError('HOLD_CONSUMED'),
  simpleError('HOLD_SEAT_MISMATCH'),
  simpleError('CHILD_ONLY_BOOKING'),
  simpleError('ACCESS_SEAT_MISMATCH'),
  simpleError('SHOW_SOLD_OUT'),
  simpleError('BOOKING_NOT_CONFIRMABLE'),
  simpleError('CONFLICT'),
  simpleError('RATE_LIMITED'),
  simpleError('PAYLOAD_TOO_LARGE'),
  simpleError('UNAVAILABLE'),
  simpleError('INTERNAL'),
])
export type ApiError = z.infer<typeof ApiErrorSchema>

export const ApiFailureSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorSchema,
})
export type ApiFailure = z.infer<typeof ApiFailureSchema>

export function apiOk<T extends z.ZodType>(data: T) {
  return z.object({
    ok: z.literal(true),
    data,
  })
}

export const ListMoviesResponseSchema = apiOk(z.array(MovieSchema))
export const GetMovieResponseSchema = apiOk(MovieSchema)
export const ListShowsResponseSchema = apiOk(z.array(ShowResponseSchema))
export const GetShowResponseSchema = apiOk(ShowResponseSchema)
export const GetSeatMapResponseSchema = apiOk(SeatMapResponseSchema)
export const HoldResponseSchema = apiOk(HoldSchema)
export const ReleaseHoldResponseSchema = apiOk(ReleasedHoldSchema)
export const BookingResponseSchema = apiOk(BookingRecordSchema)
export const HealthResponseSchema = apiOk(z.object({
  status: z.literal('ok'),
  db: z.literal('ok'),
}))

// ---------------------------------------------------------------- routes and limits

export const routes = {
  health: '/api/health',
  movies: '/api/movies',
  movie: (id: string) => `/api/movies/${encodeURIComponent(id)}`,
  shows: '/api/shows',
  show: (id: string) => `/api/shows/${encodeURIComponent(id)}`,
  seatMap: (showId: string) => `/api/shows/${encodeURIComponent(showId)}/seat-map`,
  holds: '/api/holds',
  hold: (id: string) => `/api/holds/${encodeURIComponent(id)}`,
  holdRefresh: (id: string) => `/api/holds/${encodeURIComponent(id)}/refresh`,
  bookings: '/api/bookings',
  booking: (ref: string) => `/api/bookings/${encodeURIComponent(ref)}`,
  bookingConfirm: (ref: string) => `/api/bookings/${encodeURIComponent(ref)}/confirm`,
} as const

/** Separate buckets, keyed by client IP. Catalogue GETs are not in this list. */
export const RATE_LIMITS = {
  holdCreate: { method: 'POST', path: routes.holds, limit: 10, windowMs: RATE_LIMIT_WINDOW_MS },
  holdRefresh: { method: 'POST', path: '/api/holds/:id/refresh', limit: 30, windowMs: RATE_LIMIT_WINDOW_MS },
  holdRelease: { method: 'DELETE', path: '/api/holds/:id', limit: 30, windowMs: RATE_LIMIT_WINDOW_MS },
  bookingCreate: { method: 'POST', path: routes.bookings, limit: 8, windowMs: RATE_LIMIT_WINDOW_MS },
  bookingConfirm: { method: 'POST', path: '/api/bookings/:ref/confirm', limit: 8, windowMs: RATE_LIMIT_WINDOW_MS },
} as const

function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dups.add(id)
    seen.add(id)
  }
  return [...dups]
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((id, i) => id === right[i])
}
