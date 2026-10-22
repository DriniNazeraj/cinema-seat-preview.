/** fix11 — DESIGN §15.y rev 3/3.1 group seat placement (pure, unit-testable). */
import type { Hall, Seat } from './api'

export type RowOf = { label: string; seats: Seat[] }
const rowOf = (hall: Hall, seat: Seat) => hall.rows.find((r) => r.label === seat.row)!
/** a seat can be auto-included in a block: free and not a wheelchair space */
const groupable = (s: Seat, taken: Set<string>) => !taken.has(s.id) && s.type !== 'access'

/** the free run (contiguous x, no taken seat, no aisle, no wheelchair space) that contains `seat` */
export function runAround(hall: Hall, seat: Seat, taken: Set<string>): Seat[] {
  const seats = [...rowOf(hall, seat).seats].sort((a, b) => a.x - b.x)
  const i = seats.findIndex((s) => s.id === seat.id)
  if (i < 0 || !groupable(seat, taken)) return []
  let a = i, b = i
  while (a > 0 && seats[a - 1].x === seats[a].x - 1 && groupable(seats[a - 1], taken)) a--
  while (b < seats.length - 1 && seats[b + 1].x === seats[b].x + 1 && groupable(seats[b + 1], taken)) b++
  return seats.slice(a, b + 1)
}

/** N seats incl. the tapped one: centred on it, slid inside the run (row end / taken / aisle). Fewer when the run is short. */
export function placeGroup(hall: Hall, seat: Seat, n: number, taken: Set<string>): { ids: string[]; short: boolean } {
  const run = runAround(hall, seat, taken)
  if (!run.length) return { ids: [], short: true }
  if (run.length <= n) return { ids: run.map((s) => s.id), short: run.length < n }
  const t = run.findIndex((s) => s.id === seat.id)
  const start = Math.min(Math.max(t - Math.floor((n - 1) / 2), 0), run.length - n)
  return { ids: run.slice(start, start + n).map((s) => s.id), short: false }
}

/** the seat id the block would shift onto (dir -1 left / +1 right), or null when taken / aisle / row end / wheelchair */
export function shiftTarget(hall: Hall, ids: string[], dir: -1 | 1, taken: Set<string>, byId: Map<string, Seat>): string | null {
  const seats = ids.map((id) => byId.get(id)!).filter(Boolean)
  if (!seats.length || new Set(seats.map((s) => s.row)).size !== 1) return null
  const xs = seats.map((s) => s.x).sort((a, b) => a - b)
  if (xs[xs.length - 1] - xs[0] !== xs.length - 1) return null // not contiguous (split mode)
  const edge = dir === 1 ? xs[xs.length - 1] + 1 : xs[0] - 1
  const next = rowOf(hall, seats[0]).seats.find((s) => s.x === edge)
  return next && groupable(next, taken) ? next.id : null
}
export function shiftGroup(ids: string[], dir: -1 | 1, target: string, byId: Map<string, Seat>): string[] {
  const sorted = [...ids].sort((a, b) => byId.get(a)!.x - byId.get(b)!.x)
  return dir === 1 ? [...sorted.slice(1), target] : [target, ...sorted.slice(0, -1)]
}
/** rows that have a free block of n (for "Find N together" and the step-1 note) */
export function rowsWithRun(hall: Hall, n: number, taken: Set<string>): string[] {
  return hall.rows.filter((r) => r.seats.some((s) => runAround(hall, s, taken).length >= n)).map((r) => r.label)
}
export { rangeLabel } from './group-label'
