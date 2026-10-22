import type pg from 'pg'
import { config } from './config.ts'
import { CURRENCY, type TicketType } from './contract.ts'
import { ApiException } from './errors.ts'
import { int, iso } from './util.ts'

type MovieRow = {
  id: string
  title: string
  tagline: string
  runtime_min: number
  rating: string
  genres: string[]
  synopsis: string
  palette: [string, string]
  placeholder: boolean
}

type ShowRow = {
  id: string
  movie_id: string
  start: Date
  format: '2D' | '3D' | 'IMAX'
  hall_id: string
  sold_out_now: boolean
}

type PriceRow = {
  show_id: string
  ticket_type: TicketType
  price_cents: number
  currency: string
}

const showSelect = `
  SELECT
    s.id,
    s.movie_id,
    s.start,
    s.format,
    s.hall_id,
    (
      s.sold_out OR NOT EXISTS (
        SELECT 1
        FROM seats AS st
        WHERE st.hall_id = s.hall_id
          AND NOT EXISTS (
            SELECT 1
            FROM seat_occupancy AS o
            WHERE o.show_id = s.id
              AND o.seat_id = st.id
              AND (
                o.kind = 'booked'
                OR (o.kind = 'hold' AND o.expires_at > now())
              )
          )
      )
    ) AS sold_out_now
  FROM shows AS s
`

export async function listMovies(client: pg.PoolClient) {
  const result = await client.query<MovieRow>(
    `SELECT id, title, tagline, runtime_min, rating, genres, synopsis, palette, placeholder
     FROM movies
     ORDER BY position ASC, id ASC`,
  )
  return result.rows.map(movieJson)
}

export async function getMovie(client: pg.PoolClient, id: string) {
  const result = await client.query<MovieRow>(
    `SELECT id, title, tagline, runtime_min, rating, genres, synopsis, palette, placeholder
     FROM movies
     WHERE id = $1`,
    [id],
  )
  const row = result.rows[0]
  if (!row) throw new ApiException('NOT_FOUND')
  return movieJson(row)
}

function movieJson(row: MovieRow) {
  return {
    id: row.id,
    title: row.title,
    tagline: row.tagline,
    runtime: int(row.runtime_min, 'runtime'),
    rating: row.rating,
    genres: row.genres,
    synopsis: row.synopsis,
    palette: row.palette,
    placeholder: true as const,
  }
}

export async function listShows(client: pg.PoolClient, movieId: string | undefined, date: string | undefined) {
  const result = await client.query<ShowRow>(
    `${showSelect}
     WHERE ($1::text IS NULL OR s.movie_id = $1)
       AND ($2::date IS NULL OR (s.start AT TIME ZONE $3)::date = $2::date)
     ORDER BY s.start ASC, s.id ASC`,
    [movieId ?? null, date ?? null, config.cinemaTz],
  )
  return hydrateShows(client, result.rows)
}

export async function getShow(client: pg.PoolClient, id: string) {
  const result = await client.query<ShowRow>(`${showSelect} WHERE s.id = $1`, [id])
  const row = result.rows[0]
  if (!row) throw new ApiException('NOT_FOUND')
  const [show] = await hydrateShows(client, [row])
  return show
}

async function hydrateShows(client: pg.PoolClient, rows: ShowRow[]) {
  if (rows.length === 0) return []
  const prices = await client.query<PriceRow>(
    `SELECT show_id, ticket_type, price_cents, currency
     FROM ticket_prices
     WHERE show_id = ANY($1::text[])`,
    [rows.map((row) => row.id)],
  )
  const byShow = new Map<string, PriceRow[]>()
  for (const price of prices.rows) {
    const list = byShow.get(price.show_id) ?? []
    list.push(price)
    byShow.set(price.show_id, list)
  }
  return rows.map((row) => showJson(row, byShow.get(row.id) ?? []))
}

function showJson(row: ShowRow, prices: PriceRow[]) {
  const adult = prices.find((price) => price.ticket_type === 'adult')
  const child = prices.find((price) => price.ticket_type === 'child')
  if (!adult || !child) throw new Error(`Show ${row.id} is missing adult and child prices`)
  const adultCents = int(adult.price_cents, 'adult price')
  const childCents = int(child.price_cents, 'child price')
  return {
    id: row.id,
    movieId: row.movie_id,
    start: iso(row.start),
    format: row.format,
    hallId: row.hall_id,
    price: adultCents / 100,
    soldOut: row.sold_out_now,
    currency: CURRENCY,
    ticketPrices: [
      { ticketType: 'adult' as const, priceCents: adultCents, currency: CURRENCY },
      { ticketType: 'child' as const, priceCents: childCents, currency: CURRENCY },
    ],
  }
}

type SeatRow = { id: string; row: string; n: number; x: number; type: 'std' | 'access' }
type HallRow = { id: string; name: string; columns: number }
type OccupancyRow = { seat_id: string; kind: 'hold' | 'booked' }

export async function getSeatMap(client: pg.PoolClient, showId: string, holdId: string | undefined) {
  const show = await getShow(client, showId)
  const hallResult = await client.query<HallRow>(
    `SELECT id, name, columns FROM halls WHERE id = $1`,
    [show.hallId],
  )
  const hallRow = hallResult.rows[0]
  if (!hallRow) throw new Error(`Hall ${show.hallId} is missing`)
  const seatResult = await client.query<SeatRow>(
    `SELECT id, row, n, x, type
     FROM seats
     WHERE hall_id = $1
     ORDER BY row ASC, n ASC`,
    [hallRow.id],
  )
  const occupancy = await client.query<OccupancyRow>(
    `SELECT seat_id, kind
     FROM seat_occupancy
     WHERE show_id = $1
       AND (
         kind = 'booked'
         OR (kind = 'hold' AND expires_at > now())
       )`,
    [showId],
  )
  const occupied = new Map(occupancy.rows.map((row) => [row.seat_id, row.kind]))
  const own = await ownHoldSeats(client, showId, holdId)

  const grouped = new Map<string, SeatRow[]>()
  for (const seat of seatResult.rows) {
    const list = grouped.get(seat.row) ?? []
    list.push(seat)
    grouped.set(seat.row, list)
  }

  const statuses: { seatId: string; status: 'available' | 'held' | 'booked' }[] = []
  const taken: string[] = []
  for (const seat of seatResult.rows) {
    const kind = occupied.get(seat.id)
    const status = kind === 'booked' ? 'booked' : kind === 'hold' ? 'held' : 'available'
    statuses.push({ seatId: seat.id, status })
    if (status === 'booked' || (status === 'held' && !own.has(seat.id))) taken.push(seat.id)
  }

  return {
    show,
    hall: {
      id: hallRow.id,
      name: hallRow.name,
      columns: int(hallRow.columns, 'columns'),
      rows: [...grouped.entries()].map(([label, seats]) => ({
        label,
        seats: seats.map((seat) => ({
          id: seat.id,
          row: seat.row,
          n: int(seat.n, 'n'),
          x: int(seat.x, 'x'),
          type: seat.type,
        })),
      })),
    },
    taken,
    statuses,
  }
}

async function ownHoldSeats(client: pg.PoolClient, showId: string, holdId: string | undefined): Promise<Set<string>> {
  if (!holdId) return new Set()
  const result = await client.query<{ seat_id: string }>(
    `SELECT o.seat_id
     FROM holds AS h
     JOIN seat_occupancy AS o
       ON o.hold_id = h.id
      AND o.kind = 'hold'
      AND o.expires_at > now()
     WHERE h.id = $1::uuid
       AND h.show_id = $2
       AND h.released_at IS NULL
       AND h.consumed_at IS NULL
       AND h.expires_at > now()`,
    [holdId, showId],
  )
  return new Set(result.rows.map((row) => row.seat_id))
}
