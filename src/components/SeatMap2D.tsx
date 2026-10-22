import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
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
  const [tip, setTip] = useState<{ seat: Seat; x: number; top: number; bottom: number; below: boolean } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // start the (wide) mobile map centred on the middle block
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2 }, [])

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
      ref.current?.querySelector<HTMLButtonElement>(`[data-seat="${target.id}"]`)?.focus()  // browser scrolls it into view
    }
  }
  function onKey(e: KeyboardEvent, seat: Seat) {
    const k = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key]
    if (k) { e.preventDefault(); move(seat, k[0], k[1]) }
  }

  // compact = read-only mini map. Interactive: 44px hit target on mobile (visual 28px inside), 18px on sm+.
  const labelCls = compact ? 'w-3 text-center text-[10px] text-text-muted' : 'sticky z-10 w-5 self-stretch bg-surface text-center text-[10px] leading-[44px] text-text-muted sm:static sm:w-3 sm:leading-normal'
  const hit = compact ? 'size-[14px] sm:size-4' : 'size-11 sm:size-[18px]'
  const vis = compact ? 'size-full text-[8px]' : 'size-7 sm:size-full text-[10px] sm:text-[9px]'
  return (
    <div className="relative" ref={wrap}>
      <div className="mx-auto mb-4 w-4/5">
        <div className="h-2 rounded-[50%/100%_100%_0_0] bg-gradient-to-b from-accent/80 to-transparent" />
        <p className="mt-1 text-center text-[10px] tracking-[0.4em] text-text-muted">SCREEN</p>
      </div>
      {!compact && <p className="mb-2 text-center text-[11px] text-text-muted sm:hidden">Swipe or pinch to see all seats</p>}
      <div className="relative">
      {!compact && <>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-5 z-10 w-4 bg-gradient-to-r from-surface to-transparent sm:hidden" />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-5 z-10 w-4 bg-gradient-to-l from-surface to-transparent sm:hidden" />
      </>}
      <div ref={scroller} className="overflow-x-auto overscroll-x-contain pb-2 [touch-action:pan-x_pan-y_pinch-zoom]">
        <div ref={ref} role="grid" data-seatgrid aria-label={`Seat map, ${hall.name}`} aria-readonly={readOnly || undefined} className={cn('mx-auto flex w-max flex-col', compact ? 'gap-[3px] sm:gap-1' : 'gap-0 sm:gap-1')}>
          {hall.rows.map((row) => (
            <div role="row" key={row.label} className={cn('flex items-center', compact ? 'gap-[2px] sm:gap-1' : 'gap-0 sm:gap-1')}>
              <span className={cn(labelCls, 'left-0')} aria-hidden>{row.label}</span>
              {Array.from({ length: hall.columns }, (_, x) => {
                const seat = row.seats.find((s) => s.x === x)
                if (!seat) return <span key={x} className={cn(compact ? 'w-2 sm:w-3' : 'w-5 sm:w-3', 'shrink-0')} aria-hidden />
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
                      onMouseEnter={(e) => {
                        const w = wrap.current!.getBoundingClientRect(), r = e.currentTarget.getBoundingClientRect()
                        const ri = hall.rows.findIndex((x) => x.label === seat.row)
                        setTip({ seat, x: r.left + r.width / 2 - w.left, top: r.top - w.top, bottom: r.bottom - w.top, below: ri < 2 })
                        onHover?.(seat)
                      }}
                      onMouseLeave={() => { setTip(null); onHover?.(null) }}
                      className={cn(hit, 'group grid shrink-0 place-items-center focus-visible:outline-none', st === 'taken' && 'cursor-not-allowed', readOnly && 'pointer-events-none')}
                    >
                      <span aria-hidden className={cn(
                        vis, 'grid place-items-center rounded-t-md font-medium tabular-nums transition group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-1 group-focus-visible:ring-offset-bg',
                        st === 'selected' ? 'bg-accent text-accent-fg' : st === 'taken' ? 'bg-taken/50 text-text-muted' : access ? 'bg-access text-white group-hover:ring-2 group-hover:ring-accent' : 'bg-velvet text-text/70 group-hover:ring-2 group-hover:ring-accent group-hover:brightness-125',
                        shakeId === seat.id && 'animate-shake',
                      )}>
                        {st === 'taken' ? <X className="size-3" /> : access ? <Accessibility className="size-3" /> : st === 'selected' ? <Check className="size-3" /> : compact ? null : seat.n}
                      </span>
                    </button>
                  </span>
                )
              })}
              <span className={cn(labelCls, 'right-0')} aria-hidden>{row.label}</span>
            </div>
          ))}
        </div>
      </div>
      </div>
      {tip && !readOnly && (
        <div className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface-2 px-3 py-1 text-xs ring-1 ring-border"
          style={tip.below ? { left: tip.x, top: tip.bottom + 6 } : { left: tip.x, top: tip.top - 6, transform: 'translate(-50%, -100%)' }}
          data-tip={tip.below ? 'below' : 'above'} aria-hidden>
          Row {tip.seat.row} · Seat {tip.seat.n} · {eur(price)} [PH]
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
        <li key={x.t} className="flex items-center gap-1.5"><span className={cn('grid size-4 place-items-center rounded-t', x.c)} aria-hidden>{x.i}</span>{x.t}</li>
      ))}
    </ul>
  )
}
