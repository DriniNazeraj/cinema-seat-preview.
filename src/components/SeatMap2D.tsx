import { useRef, useState, type KeyboardEvent } from 'react'
import { Accessibility, Check, X } from 'lucide-react'
import type { Hall, Seat } from '@/lib/api'
import { cn, eur } from '@/lib/format'

export type SeatState = 'free' | 'taken' | 'selected'
export function seatStatus(seat: Seat, taken: Set<string>, selected: string[]): SeatState {
  return taken.has(seat.id) ? 'taken' : selected.includes(seat.id) ? 'selected' : 'free'
}
export function seatLabel(seat: Seat, st: SeatState, price: number) {
  const kind = seat.type === 'access' ? ', wheelchair space' : ''
  return `Row ${seat.row}, seat ${seat.n}${kind}, ${st}, ${eur(price)} [PH]`
}

type Props = {
  hall: Hall
  taken: Set<string>
  selected: string[]
  price: number
  onPick: (seat: Seat) => void
  onHover?: (seat: Seat | null) => void
  shakeId?: string | null
  readOnly?: boolean
  compact?: boolean
}

export function SeatMap2D({ hall, taken, selected, price, onPick, onHover, shakeId, readOnly, compact }: Props) {
  const firstFree = hall.rows.flatMap((r) => r.seats).find((s) => !taken.has(s.id))
  const [focusId, setFocusId] = useState<string | undefined>(selected[0] ?? firstFree?.id)
  const [tip, setTip] = useState<Seat | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  function move(seat: Seat, dr: number, dc: number) {
    const ri = hall.rows.findIndex((r) => r.label === seat.row)
    let target: Seat | undefined
    if (dc !== 0) {
      const row = hall.rows[ri].seats
      target = row[row.findIndex((s) => s.id === seat.id) + dc]
    } else {
      const row = hall.rows[ri + dr]?.seats
      target = row?.reduce<Seat | undefined>((best, s) => (!best || Math.abs(s.x - seat.x) < Math.abs(best.x - seat.x) ? s : best), undefined)
    }
    if (target) {
      setFocusId(target.id)
      ref.current?.querySelector<HTMLButtonElement>(`[data-seat="${target.id}"]`)?.focus()
    }
  }
  function onKey(e: KeyboardEvent, seat: Seat) {
    const k = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key]
    if (k) { e.preventDefault(); move(seat, k[0], k[1]) }
  }

  const size = compact ? 'size-[14px] sm:size-4 text-[8px]' : 'size-[14px] sm:size-[18px] text-[9px]'
  return (
    <div className="relative">
      <div className="mx-auto mb-4 w-4/5">
        <div className="h-2 rounded-[50%/100%_100%_0_0] bg-gradient-to-b from-accent/80 to-transparent" />
        <p className="mt-1 text-center text-[10px] tracking-[0.4em] text-text-muted">SCREEN</p>
      </div>
      <div className="overflow-x-auto pb-2 [touch-action:pan-x_pan-y_pinch-zoom]">
        <div ref={ref} role="grid" aria-label={`Seat map, ${hall.name}`} aria-readonly={readOnly || undefined} className="mx-auto flex w-max flex-col gap-[3px] sm:gap-1">
          {hall.rows.map((row) => (
            <div role="row" key={row.label} className="flex items-center gap-[2px] sm:gap-1">
              <span className="w-3 text-center text-[10px] text-text-muted" aria-hidden>{row.label}</span>
              {Array.from({ length: hall.columns }, (_, x) => {
                const seat = row.seats.find((s) => s.x === x)
                if (!seat) return <span key={x} className={cn('w-2 sm:w-3', 'shrink-0')} aria-hidden />
                const st = seatStatus(seat, taken, selected)
                const access = seat.type === 'access'
                return (
                  <span role="gridcell" key={seat.id}>
                    <button
                      data-seat={seat.id}
                      tabIndex={readOnly ? -1 : seat.id === focusId ? 0 : -1}
                      aria-label={seatLabel(seat, st, price)}
                      aria-pressed={st === 'selected'}
                      aria-disabled={st === 'taken' || readOnly || undefined}
                      onClick={() => !readOnly && onPick(seat)}
                      onKeyDown={(e) => onKey(e, seat)}
                      onFocus={() => { setFocusId(seat.id); onHover?.(seat) }}
                      onMouseEnter={() => { setTip(seat); onHover?.(seat) }}
                      onMouseLeave={() => { setTip(null); onHover?.(null) }}
                      className={cn(
                        size, 'grid shrink-0 place-items-center rounded-t-md font-medium tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
                        st === 'selected' ? 'bg-accent text-accent-fg' : st === 'taken' ? 'cursor-not-allowed bg-taken/50 text-text-muted' : access ? 'bg-access text-white hover:ring-2 hover:ring-accent' : 'bg-velvet text-text/70 hover:ring-2 hover:ring-accent hover:brightness-125',
                        shakeId === seat.id && 'animate-shake',
                        readOnly && 'pointer-events-none',
                      )}
                    >
                      {st === 'taken' ? <X className="size-3" aria-hidden /> : access ? <Accessibility className="size-3" aria-hidden /> : st === 'selected' ? <Check className="size-3" aria-hidden /> : compact ? null : <span className="hidden sm:inline">{seat.n}</span>}
                    </button>
                  </span>
                )
              })}
              <span className="w-3 text-center text-[10px] text-text-muted" aria-hidden>{row.label}</span>
            </div>
          ))}
        </div>
      </div>
      {tip && !readOnly && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-surface-2 px-3 py-1 text-xs ring-1 ring-border" aria-hidden>
          Row {tip.row} · Seat {tip.n} · {eur(price)} [PH]
        </div>
      )}
    </div>
  )
}

export function SeatLegend() {
  const items = [
    { c: 'bg-velvet', t: 'Free', i: null },
    { c: 'bg-accent text-accent-fg', t: 'Selected', i: <Check className="size-3" /> },
    { c: 'bg-taken/50 text-text-muted', t: 'Taken', i: <X className="size-3" /> },
    { c: 'bg-access text-white', t: 'Wheelchair', i: <Accessibility className="size-3" /> },
  ]
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted" aria-label="Seat legend">
      {items.map((x) => (
        <li key={x.t} className="flex items-center gap-[2px] sm:gap-1"><span className={cn('grid size-4 place-items-center rounded-t', x.c)} aria-hidden>{x.i}</span>{x.t}</li>
      ))}
    </ul>
  )
}
