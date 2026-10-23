/**
 * Mock data layer — the ONLY place that knows where data comes from.
 * Everything here is PLACEHOLDER [PH]. When the real back end lands, swap the
 * function bodies for fetch() calls against docs/api.md; keep the zod schemas
 * and signatures so the UI doesn't change.
 */
import { z } from 'zod'

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
  seats: z.array(SeatId).min(1).max(8),
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

export const MAX_SEATS = 8
export const HOLD_SECONDS = 600

// ---------------------------------------------------------------- mock data
const MOVIES: Movie[] = ([
  { id: 'starlight-run', title: 'Starlight Run', tagline: 'One night. One road. No way back.', runtime: 124, rating: 'PG-13', genres: ['Action', 'Sci-Fi'], synopsis: 'A courier crosses a city that only exists after midnight to deliver a package nobody should open. [PH] synopsis.', palette: ['#7A1F2B', '#F2B544'] },
  { id: 'the-quiet-harbor', title: 'The Quiet Harbor', tagline: 'Some tides bring things back.', runtime: 108, rating: 'PG', genres: ['Drama'], synopsis: 'A lighthouse keeper and a stranded sailor share one long winter. [PH] synopsis.', palette: ['#1E3A5F', '#A3C4F3'] },
  { id: 'neon-alley', title: 'Neon Alley', tagline: 'Every light hides a secret.', runtime: 97, rating: 'R', genres: ['Thriller'], synopsis: 'A detective with a broken camera follows a trail of pink neon. [PH] synopsis.', palette: ['#3B0A45', '#FF4FA3'] },
  { id: 'paper-moons', title: 'Paper Moons', tagline: 'Fold the sky, keep the dream.', runtime: 92, rating: 'G', genres: ['Animation', 'Family'], synopsis: 'Two siblings build a paper moon to light their village. [PH] synopsis.', palette: ['#0F3D3E', '#F4F1EA'] },
  { id: 'iron-orchard', title: 'Iron Orchard', tagline: 'What grows here, stays here.', runtime: 131, rating: 'PG-13', genres: ['Drama', 'Mystery'], synopsis: 'A family returns to the orchard where the trees are made of metal. [PH] synopsis.', palette: ['#3D2B1F', '#C9A227'] },
  { id: 'laugh-track', title: 'Laugh Track', tagline: 'The show must go wrong.', runtime: 101, rating: 'PG-13', genres: ['Comedy'], synopsis: 'A sitcom cast gets stuck living inside their own reruns. [PH] synopsis.', palette: ['#1F3D1F', '#9BE564'] },
] as Omit<Movie, 'placeholder'>[]).map((m) => ({ ...m, placeholder: true as const }))

const COLS = [4, 8, 4] // seat blocks, aisles between them
const ROW_LABELS = 'ABCDEFGHIJ'.split('')
function buildHall(id: string, name: string): Hall {
  const rows = ROW_LABELS.map((label, ri) => {
    const seats: Seat[] = []
    let x = 0
    let n = 1
    COLS.forEach((count, bi) => {
      for (let i = 0; i < count; i++) {
        const isAccess = ri === ROW_LABELS.length - 1 && (n === 1 || n === 2 || n === 15 || n === 16)
        seats.push({ id: `${label}${n}`, row: label, n, x, type: isAccess ? 'access' : 'std' })
        x++; n++
      }
      if (bi < COLS.length - 1) x++ // aisle gap
    })
    return { label, seats }
  })
  return { id, name, columns: COLS.reduce((a, b) => a + b, 0) + COLS.length - 1, rows }
}
const HALLS: Hall[] = [buildHall('h1', 'Hall 1 [PH]'), buildHall('h2', 'Hall 2 [PH]')]

function seeded(seed: number) {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}
function hash(str: string) {
  let h = 2166136261
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TIMES = ['13:30', '16:00', '18:45', '21:15']
// fix13: no IMAX surcharge (back end: flat adult 1200 cents); the UI reads show.price from the response
const PRICE: Record<z.infer<typeof ShowFormat>, number> = { '2D': 9, '3D': 12, IMAX: 12 }
function buildShows(): Show[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const shows: Show[] = []
  for (let d = 0; d < 7; d++) {
    const day = new Date(today)
    day.setDate(today.getDate() + d)
    MOVIES.forEach((m, mi) => {
      const rnd = seeded(hash(m.id + d))
      TIMES.forEach((t, ti) => {
        if (rnd() < 0.3) return // not every slot runs every day
        const [hh, mm] = t.split(':').map(Number)
        const start = new Date(day)
        start.setHours(hh, mm)
        const format = (['2D', '3D', 'IMAX'] as const)[(mi + ti) % 3]
        const id = `${m.id}-${dayKey(day)}-${t.replace(':', '')}`
        shows.push({ id, movieId: m.id, start: start.toISOString(), format, hallId: HALLS[(mi + ti) % 2].id, price: PRICE[format], soldOut: (mi + ti + d) % 11 === 0 })
      })
    })
  }
  return shows
}
let SHOWS: Show[] | null = null
const shows = () => (SHOWS ??= buildShows())

function takenFor(show: Show, hall: Hall): string[] {
  const all = hall.rows.flatMap((r) => r.seats.map((s) => s.id))
  if (show.soldOut) return all
  const rnd = seeded(hash(show.id))
  const taken = all.filter(() => rnd() < 0.28)
  // QA fixture: one taken access seat (J2) on this show; other access seats stay free.
  if (show.id === 'iron-orchard-2026-10-25-1845') {
    return [...taken.filter((id) => !['J1', 'J2', 'J15', 'J16'].includes(id)), 'J2']
  }
  return taken
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const BOOKINGS_KEY = 'lumen.bookings'

// ---------------------------------------------------------------- public API
export async function listMovies(): Promise<Movie[]> {
  await delay(40)
  return z.array(MovieSchema).parse(MOVIES)
}
export async function getMovie(id: string): Promise<Movie | null> {
  await delay(40)
  return MOVIES.find((m) => m.id === id) ?? null
}
export async function listShows(opts: { movieId?: string; date?: string } = {}): Promise<Show[]> {
  await delay(40)
  return z.array(ShowSchema).parse(
    shows().filter((s) => (!opts.movieId || s.movieId === opts.movieId) && (!opts.date || dayKey(new Date(s.start)) === opts.date)),
  )
}
export async function getShow(id: string): Promise<Show | null> {
  await delay(40)
  return shows().find((s) => s.id === id) ?? null
}
/** fix15.2: typed API errors, mirroring the real API (PR #3): 404 NOT_FOUND = show missing; anything else (network, 5xx) is transient. No 410. */
export class NotFoundError extends Error { readonly status = 404; readonly code = 'NOT_FOUND'; constructor(msg = 'Not found') { super(msg); this.name = 'NotFoundError' } }
export class NetworkError extends Error { constructor(msg = 'Network error') { super(msg); this.name = 'NetworkError' } }
export const isNotFound = (e: unknown): e is NotFoundError => e instanceof NotFoundError
/** An ended show still exists (200, start in the past, soldOut true), like the real API. The mock only generates today+6 days,
 *  so ids of earlier days (<= 60 days back, known film + time slot) are synthesised here. */
function endedShow(id: string): Show | undefined {
  const m = /^(.+)-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/.exec(id); if (!m) return
  const [, movieId, day, hh, mm] = m, mi = MOVIES.findIndex((x) => x.id === movieId), ti = TIMES.indexOf(`${hh}:${mm}`)
  if (mi < 0 || ti < 0) return
  const start = new Date(`${day}T${hh}:${mm}:00`), age = Date.now() - start.getTime()
  if (!(age > 0 && age < 60 * 864e5)) return
  const format = (['2D', '3D', 'IMAX'] as const)[(mi + ti) % 3]
  return { id, movieId, start: start.toISOString(), format, hallId: HALLS[(mi + ti) % 2].id, price: PRICE[format], soldOut: true }
}
export async function getSeatMap(showId: string): Promise<SeatMap> {
  await delay()
  // QA hook: sessionStorage lumen.qa.failSeatMap='1' simulates a network/5xx failure
  let fail = false; try { fail = sessionStorage.getItem('lumen.qa.failSeatMap') === '1' } catch { /* no storage */ }
  if (fail) throw new NetworkError('Simulated network failure')
  const found = shows().find((s) => s.id === showId)
  const show = found && new Date(found.start).getTime() <= Date.now() ? { ...found, soldOut: true } : found ?? endedShow(showId)
  if (!show) throw new NotFoundError('Show not found')
  const hall = HALLS.find((h) => h.id === show.hallId)!
  return SeatMapSchema.parse({ show, hall, taken: takenFor(show, hall) })
}
export async function createBooking(input: BookingInput): Promise<Booking> {
  await delay(400)
  const data = BookingInputSchema.parse(input)
  const map = await getSeatMap(data.showId)
  const clash = data.seats.filter((s) => map.taken.includes(s))
  if (clash.length) throw new Error(`Seat(s) no longer free: ${clash.join(', ')}`)
  const booking: Booking = BookingSchema.parse({
    ...data,
    ref: 'LUM-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    total: data.seats.length * map.show.price,
    createdAt: new Date().toISOString(),
    placeholder: true,
  })
  try {
    const all = JSON.parse(sessionStorage.getItem(BOOKINGS_KEY) ?? '{}')
    all[booking.ref] = booking
    sessionStorage.setItem(BOOKINGS_KEY, JSON.stringify(all))
  } catch { /* storage unavailable */ }
  return booking
}
export async function getBooking(ref: string): Promise<Booking | null> {
  await delay(40)
  try {
    const all = JSON.parse(sessionStorage.getItem(BOOKINGS_KEY) ?? '{}')
    return all[ref] ? BookingSchema.parse(all[ref]) : null
  } catch { return null }
}

// fix11: holds are created only at Continue (whole group). Mock of POST /api/holds and DELETE /api/holds/:id.
// QA: sessionStorage 'lumen.qa.takeOnHold' = "C9,C10" makes those seats get taken just before the hold (SEAT_TAKEN 409).
export class SeatTakenError extends Error { code = 'SEAT_TAKEN' as const; constructor(public seatIds: string[]) { super('SEAT_TAKEN') } }
export async function createHold(showId: string, seatIds: string[]): Promise<{ id: string; holdExpiresAt: number }> {
  await delay(200)
  const map = await getSeatMap(showId)
  let qaTake: string[] = []
  try { qaTake = (sessionStorage.getItem('lumen.qa.takeOnHold') ?? '').split(',').filter(Boolean) } catch { /* ignore */ }
  const lost = seatIds.filter((s) => map.taken.includes(s) || qaTake.includes(s))
  if (lost.length) throw new SeatTakenError(lost)
  return { id: 'hold_' + Math.random().toString(36).slice(2, 10), holdExpiresAt: Date.now() + HOLD_SECONDS * 1000 }
}
export async function releaseHoldApi(holdId: string): Promise<void> {
  await delay(60)
  try { const w = window as Window & { __lumenReleased?: string[] }; (w.__lumenReleased ??= []).push(holdId) } catch { /* ssr */ }
}

/** Sync accessors used only by the build-time prerenderer and SEO helpers. */
export const __static = { movies: () => MOVIES, shows, dayKey }
