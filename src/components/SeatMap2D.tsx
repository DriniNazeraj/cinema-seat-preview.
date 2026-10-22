import React, { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Accessibility, Check, X, ZoomIn, ZoomOut } from 'lucide-react'
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
  /** fix11 §15.y: ghost preview of the block a click would place (desktop hover), rows to pulse once (Find N together), [ / ] shift */
  preview?: Set<string>
  pulseRows?: Set<string>
  onShift?: (dir: -1 | 1) => void
}

let keptZoom = false
/** seat page calls this on mount so a new visit starts in fit mode */
export function resetSeatMapZoom() { keptZoom = false }

export function SeatMap2D({ hall, taken, selected, price, onPick, onHover, shakeId, readOnly, compact, preview, pulseRows, onShift }: Props) {
  const firstFree = hall.rows.flatMap((r) => r.seats).find((s) => !taken.has(s.id))
  const [focusId, setFocusId] = useState<string | undefined>(selected[0] ?? firstFree?.id)
  const [tip, setTip] = useState<{ seat: Seat; x: number; top: number; bottom: number; below: boolean } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // fix6: interactive map fits the whole row to the panel width (1fr columns, 3px gap); pinch (or the zoom button) zooms
  // to 44px seats. Seats under 20px hide their numbers (the tooltip / aria-label still give them).
  // zoom survives the sheet closing/reopening during this page visit (the map unmounts with the sheet)
  const [zoomed, setZoomedRaw] = useState(() => !compact && keptZoom)
  const setZoomed = (z: boolean | ((v: boolean) => boolean)) => setZoomedRaw((v) => { const n = typeof z === 'function' ? z(v) : z; keptZoom = n; return n })
  // fix7 (designer): on phones a pointer tap in fit mode never picks; it zooms (~2.5-3x, seats >= 44px) centred on that seat.
  // Keyboard / screen-reader activation (click with detail 0) still picks. Desktop unchanged.
  const [phone, setPhone] = useState(false)
  const [everZoomed, setEverZoomed] = useState(() => keptZoom)
  const zoomTo = useRef<string | null>(null)
  useEffect(() => {
    if (compact) return
    const mq = window.matchMedia('(max-width: 767px)'); const f = () => setPhone(mq.matches); f()
    mq.addEventListener('change', f); return () => mq.removeEventListener('change', f)
  }, [compact])
  useEffect(() => { if (zoomed) setEverZoomed(true) }, [zoomed])
  const [cell, setCell] = useState(44)
  const pinch = useRef<number | null>(null)
  useEffect(() => {
    const g = ref.current; if (compact || !g) return
    const ro = new ResizeObserver(() => { const b = g.querySelector('[data-seat]'); if (b) setCell(Math.round(b.getBoundingClientRect().width)) })
    ro.observe(g); return () => ro.disconnect()
  }, [compact])
  // when zooming in, keep the middle block in view
  useEffect(() => {
    const el = scroller.current; if (!el || !zoomed) return
    const id = zoomTo.current; zoomTo.current = null
    const seatEl = id ? ref.current?.querySelector<HTMLElement>(`[data-seat="${id}"]`) : null
    if (seatEl) seatEl.scrollIntoView({ block: 'center', inline: 'center' })
    else el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
  }, [zoomed])
  const tapZooms = !compact && !readOnly && phone && !zoomed
  const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  const touch = {
    onTouchStart: (e: React.TouchEvent) => { if (e.touches.length === 2) pinch.current = dist(e.touches as unknown as TouchList) },
    onTouchMove: (e: React.TouchEvent) => {
      if (pinch.current === null || e.touches.length !== 2) return
      const r = dist(e.touches as unknown as TouchList) / pinch.current
      if (r > 1.15) { setZoomed(true); pinch.current = null } else if (r < 0.87) { setZoomed(false); pinch.current = null }
    },
    onTouchEnd: () => { pinch.current = null },
  }

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
    else if ((e.key === '[' || e.key === ']') && onShift) { e.preventDefault(); onShift(e.key === '[' ? -1 : 1) }
  }

  // compact = read-only mini map. Interactive: 44px hit target on mobile (visual 28px inside), 18px on sm+.
  const labelCls = compact ? 'w-3 text-center text-[10px] text-text-muted' : cn('z-10 bg-surface text-center text-[10px] text-text-muted', zoomed && 'sticky self-stretch leading-[44px]')
  const hit = compact ? 'size-[14px] sm:size-4' : 'aspect-square w-full'
  const vis = compact ? 'size-full text-[8px]' : cn('size-full', zoomed ? 'text-[11px]' : 'text-[9px]')
  const showNum = !compact && cell >= 20
  return (
    <div className="relative" ref={wrap}>
      <div className="mx-auto mb-4 w-4/5">
        <div className="h-2 rounded-[50%/100%_100%_0_0] bg-gradient-to-b from-accent/80 to-transparent" />
        <p className="mt-1 text-center text-[10px] tracking-[0.4em] text-text-muted">SCREEN</p>
      </div>
      {!compact && (
        <div className="mb-2 flex items-center justify-center gap-2 text-[11px] text-text-muted">
          <p className="sm:hidden">Swipe or pinch to see all seats</p>
          <button type="button" onClick={() => setZoomed((z) => !z)} aria-pressed={zoomed} aria-label={zoomed ? 'Zoom out to fit the hall' : 'Zoom in on seats'}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 ring-1 ring-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {zoomed ? <ZoomOut className="size-4" aria-hidden /> : <ZoomIn className="size-4" aria-hidden />}<span>{zoomed ? 'Fit' : 'Zoom'}</span>
          </button>
        </div>
      )}
      <div className="relative">
      {!compact && zoomed && <>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-5 z-10 w-4 bg-gradient-to-r from-surface to-transparent sm:hidden" />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-5 z-10 w-4 bg-gradient-to-l from-surface to-transparent sm:hidden" />
      </>}
      <div ref={scroller} {...(compact ? {} : touch)} className={cn('overflow-x-auto overscroll-x-contain pb-2', compact ? '[touch-action:pan-x_pan-y_pinch-zoom]' : '[touch-action:pan-x_pan-y]')}>
        <div ref={ref} role="grid" data-seatgrid aria-label={`Seat map, ${hall.name}`} aria-readonly={readOnly || undefined} className={cn('mx-auto flex flex-col', compact ? 'w-max gap-[3px] sm:gap-1' : 'gap-[3px]')}
          style={compact ? undefined : { width: zoomed ? (hall.columns + 2) * 47 : '100%' }}>
          {hall.rows.map((row) => (
            <div role="row" key={row.label} data-pulse={pulseRows?.has(row.label) || undefined} className={cn(pulseRows?.has(row.label) && 'rounded-md ring-2 ring-accent/70 motion-safe:animate-[pulse_1.2s_ease-in-out_1]', compact ? 'flex items-center gap-[2px] sm:gap-1' : 'grid items-center gap-[3px]')}
              style={compact ? undefined : { gridTemplateColumns: `repeat(${hall.columns + 2}, minmax(0, 1fr))` }}>
              <span className={cn(labelCls, 'left-0')} aria-hidden>{row.label}</span>
              {Array.from({ length: hall.columns }, (_, x) => {
                const seat = row.seats.find((s) => s.x === x)
                if (!seat) return <span key={x} className={cn(compact ? 'w-2 sm:w-3 shrink-0' : '')} aria-hidden />
                const st = seatStatus(seat, taken, selected)
                const access = seat.type === 'access'
                return (
                  <span role="gridcell" key={seat.id} className={compact ? undefined : 'block min-w-0'}>
                    <button
                      data-seat={seat.id}
                      tabIndex={readOnly ? -1 : seat.id === focusId ? 0 : -1}
                      aria-label={seatLabel(seat, st, price)}
                      aria-pressed={st === 'selected'}
                      aria-disabled={st === 'taken' || readOnly || undefined}
                      data-tapzoom={tapZooms || undefined}
                      data-preview={(st === 'free' && preview?.has(seat.id)) || undefined}
                      onClick={(e) => {
                        if (readOnly) return
                        if (tapZooms && e.detail > 0) { zoomTo.current = seat.id; setFocusId(seat.id); setZoomed(true); return }
                        onPick(seat)
                      }}
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
                        st === 'free' && preview?.has(seat.id) && 'ring-2 ring-accent/40',
                      )}>
                        {st === 'taken' ? <X className="size-3" /> : access ? <Accessibility className="size-3" /> : st === 'selected' ? <Check className="size-3" /> : showNum ? seat.n : null}
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
      {!compact && !readOnly && phone && !everZoomed && <p data-tap-hint className="mt-1 text-center text-[11px] text-text-muted">Tap to zoom in, then pick your seat [PH]</p>}
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
