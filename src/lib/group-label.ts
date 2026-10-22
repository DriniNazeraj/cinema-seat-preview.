import type { Seat } from './api'

/** "C9 to C12" / "C9" */
export function rangeLabel(ids: string[], byId: Map<string, Seat>): string {
  const s = ids.map((id) => byId.get(id)!).filter(Boolean)
  if (!s.length) return ''
  const sorted = [...s].sort((a, b) => (a.row === b.row ? a.x - b.x : a.row.localeCompare(b.row)))
  const oneRow = new Set(sorted.map((x) => x.row)).size === 1
  const contiguous = oneRow && sorted[sorted.length - 1].x - sorted[0].x === sorted.length - 1
  if (sorted.length === 1) return sorted[0].id
  return contiguous ? `${sorted[0].id} to ${sorted[sorted.length - 1].id}` : sorted.map((x) => x.id).join(', ')
}
