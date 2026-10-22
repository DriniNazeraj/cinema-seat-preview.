import { lazy, Suspense, useEffect, useMemo, useRef, useState, Component, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Box, Eye, RotateCcw } from 'lucide-react'
import { getMovie, getSeatMap, listShows, MAX_SEATS, type Seat } from '@/lib/api'
import { useData } from '@/lib/useData'
import { useBooking } from '@/lib/booking'
import { decideThree, isPhone, type ThreeDecision } from '@/lib/device'
import { isHall3DReady } from '@/lib/prefetch3d'
import { cn, dayLabel, eur, prefersReducedMotion, time } from '@/lib/format'
import { Button, Container, ErrorCard, Skeleton } from '@/components/ui'
import { Curtains, type CurtainPhase } from '@/components/Curtains'
import { SeatSheet } from '@/components/SeatSheet'
import { SeatLegend, SeatMap2D } from '@/components/SeatMap2D'
import { StepIndicator } from '@/components/Shows'
import { ViewFromSeatCard } from '@/components/ViewFromSeatCard'

const HallScene3D = lazy(() => import('@/three/HallScene3D'))

class GLBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

export default function SeatsPage() {
  const { id = '' } = useParams()
  const [q, setQ] = useSearchParams()
  const [noShows, setNoShows] = useState(false)
  const showId = q.get('show') ?? ''
  const nav = useNavigate()
  const booking = useBooking()
  const map = useData(`seatmap:${showId}`, () => getSeatMap(showId))
  const movie = useData(`movie:${id}`, () => getMovie(id))

  const [decision, setDecision] = useState<ThreeDecision | null>(null)
  const [threeOn, setThreeOn] = useState(false)
  const [threeReady, setThreeReady] = useState(false)
  // Defer the three.js import + mount until after the title/showtime/2D map have painted and the
  // main thread is idle, so 3D never competes with LCP. Safari has no requestIdleCallback -> setTimeout.
  const [idle, setIdle] = useState(false)
  const [lostNote, setLostNote] = useState<string | null>(null)
  const [focusSeat, setFocusSeat] = useState<Seat | null>(null)
  const [hovered, setHovered] = useState<Seat | null>(null)
  const [shake, setShake] = useState<string | null>(null)
  const [limitMsg, setLimitMsg] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [curtain, setCurtain] = useState<CurtainPhase>('closed')
  const [progress, setProgress] = useState(0)
  // §14 fps guard: ?3d=1 or ?nofps=1 turn it off; ?fps=slow forces it on and simulates <30fps (QA for the toast)
  const fpsSlow = q.get('fps') === 'slow'
  const fpsGuard = fpsSlow || (q.get('3d') !== '1' && q.get('nofps') !== '1')
  const [quick, setQuick] = useState(false) // chunk prefetched: no progress line, closed 150ms then open
  const [sheetOpen, setSheetOpen] = useState(false)
  const peekRef = useRef<HTMLButtonElement>(null)
  // fix6: never start the 3D mount (shader compile) mid-slide; a mounted hall is frozen (paused) during the slide
  const hallMounted = useRef(false)

  // No ?show= in the URL (e.g. a shared/bookmarked /movie/:id/seats link): pick the next bookable show
  // instead of dead-ending, keeping other params such as ?3d=1.
  useEffect(() => {
    if (showId) return
    let live = true
    listShows({ movieId: id }).then((list) => {
      if (!live) return
      const open = list.filter((s) => !s.soldOut)
      const next = open.find((s) => new Date(s.start).getTime() > Date.now()) ?? open[0]
      if (!next) return setNoShows(true)
      const p = new URLSearchParams(q); p.set('show', next.id)
      setQ(p, { replace: true })
    })
    return () => { live = false }
  }, [showId, id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (showId) booking.setShow(showId) }, [showId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const d = decideThree()
    setDecision(d)
    setThreeOn(d.mode === 'auto')
    // §10: skip curtains when 3D won't run, or if already shown this session; fallback opens the sheet at once.
    if (d.mode !== 'auto' || sessionStorage.getItem('lumen.curtain') === '1') { setCurtain('gone'); setSheetOpen(true) }
    else { sessionStorage.setItem('lumen.curtain', '1'); if (isHall3DReady()) setQuick(true) }
  }, [])
  // progress 0->85% indeterminate, 100% on ready; open on 3D ready, context loss, or the 2.5s cap.
  useEffect(() => {
    if (curtain !== 'closed') return
    if (quick) { const q = setTimeout(() => { setProgress(100); setCurtain('opening') }, 150); return () => clearTimeout(q) }
    // CSS-driven (no rAF loop) so requestIdleCallback can fire and the 3D mounts early
    const r = requestAnimationFrame(() => setProgress(85))
    const cap = setTimeout(() => setCurtain('opening'), 2500)
    return () => { cancelAnimationFrame(r); clearTimeout(cap) }
  }, [curtain, quick])
  useEffect(() => { if (curtain === 'closed' && (threeReady || lostNote)) { setProgress(100); setCurtain('opening') } }, [threeReady, lostNote, curtain])
  useEffect(() => { if (curtain === 'opening') performance.mark('lumen:curtain-open') }, [curtain])
  useEffect(() => { if (!sheetOpen && curtain === 'gone') peekRef.current?.focus({ preventScroll: true }) }, [sheetOpen, curtain])
  useEffect(() => { if (movie.data) document.title = `Choose seats · ${movie.data.title} [PH] | Lumen Cinema [PH]` }, [movie.data])

  const mapReady = !!map.data
  useEffect(() => {
    if (!mapReady || idle) return
    let cancelled = false, idleId: number | undefined, t: ReturnType<typeof setTimeout> | undefined
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const go = () => { if (!cancelled) setIdle(true) }
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(go, { timeout: 1500 })
      else t = setTimeout(go, 1200)
    }))
    return () => { cancelled = true; cancelAnimationFrame(raf); if (idleId !== undefined) w.cancelIdleCallback?.(idleId); if (t) clearTimeout(t) }
  }, [mapReady, idle])

  const taken = useMemo(() => new Set(map.data?.taken ?? []), [map.data])
  const seatsById = useMemo(() => new Map(map.data?.hall.rows.flatMap((r) => r.seats.map((s) => [s.id, s] as const)) ?? []), [map.data])
  const selected = booking.showId === showId ? booking.seats : []
  const price = map.data?.show.price ?? 0
  const lastSelected = focusSeat ?? (selected.length ? seatsById.get(selected[selected.length - 1]) ?? null : null)

  function pick(seat: Seat) {
    if (taken.has(seat.id)) {
      setShake(seat.id); setTimeout(() => setShake(null), 600)
      toast("That seat's taken")
      return
    }
    if (selected.includes(seat.id)) {
      booking.toggleSeat(seat.id); setLimitMsg(false)
      // fly to the most recently selected seat that is still selected; overview only when none left
      const remaining = selected.filter((id) => id !== seat.id)
      const prev = remaining.length ? seatsById.get(remaining[remaining.length - 1]) ?? null : null
      if (prev) setFocusSeat(prev)
      else { setFocusSeat(null); setResetKey((k) => k + 1) }
      return
    }
    if (selected.length >= MAX_SEATS) { setLimitMsg(true); return }
    booking.toggleSeat(seat.id)
    setFocusSeat(seat)
    // §11.4: the sheet collapses to the peek bar after a pick (3D: camera fly visible; simple: view-from-seat card visible).
    setSheetOpen(false)
  }

  if (!showId) return (
    <Container className="min-h-[115svh] py-10">
      {noShows ? <ErrorCard message="No bookable showtimes for this film." onRetry={() => nav(`/movie/${id}`)} /> : <Skeleton className="h-96" />}
    </Container>
  )
  if (map.error) return <Container className="py-16"><ErrorCard onRetry={map.retry} /></Container>

  const show = map.data?.show
  const soldOut = !!map.data && map.data.hall.rows.every((r) => r.seats.every((s) => taken.has(s.id)))
  const accessPicked = selected.some((s) => seatsById.get(s)?.type === 'access')
  const fallback = !threeOn || !!lostNote
  const total = selected.length * price

  function slowToast() {
    if (sessionStorage.getItem('lumen.slowtoast') === '1') return
    sessionStorage.setItem('lumen.slowtoast', '1')
    toast('Running slow? Switch to simple view', {
      position: 'bottom-center', className: 'mb-16', duration: Infinity, closeButton: true,
      action: { label: 'Switch', onClick: () => { localStorage.setItem('lumen.simple', '1'); setThreeOn(false) } },
    })
  }
  const seatLabel = selected.length ? selected.join(', ') : 'No seats yet'
  const goBook = () => { booking.startHold(); nav('/booking') }
  const showLine = show ? `${dayLabel(show.start)} · ${time(show.start)} · ${show.format} · ${map.data?.hall.name}` : '\u00a0'
  const curtainsUp = curtain !== 'gone'
  const titleText = <>{movie.data?.title ?? '…'} <span className="text-base text-text-muted">[PH]</span></>
  const iconBtn = 'inline-flex size-11 items-center justify-center gap-1 rounded-full bg-bg/70 text-xs ring-1 ring-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:w-auto md:px-3'

  return (
    <div className="fixed inset-0 z-40 h-[100svh] overflow-hidden bg-bg" aria-busy={threeOn && !threeReady && !lostNote}>
      <p role="status" className="sr-only">{fallback ? 'Showing simple seat view' : threeReady ? '3D preview ready' : 'Loading the 3D seat preview'}</p>
      {/* hall layer: 3D canvas, or the static view-from-seat card (fallback) */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#2a0d12,#0B0B0F_70%)]">
        {map.data && fallback && (
          <div className="absolute inset-0 grid place-items-center p-4 pb-20 pt-16 md:pr-[calc(min(480px,40vw)+32px)]">
            <div className="w-full max-w-3xl"><ViewFromSeatCard seat={lastSelected} hall={map.data.hall} note={lostNote ?? (decision?.mode === 'off' ? decision.reason : undefined)} /></div>
          </div>
        )}
        {map.data && threeOn && idle && !lostNote && (curtain !== 'opening' || hallMounted.current) && (hallMounted.current = true) && (
          <div className={cn('absolute inset-0 transition-opacity duration-500', threeReady && !curtainsUp ? 'opacity-100' : 'invisible opacity-0')}
            onTransitionEnd={(e) => { if (e.target === e.currentTarget && threeReady) performance.mark('lumen:hall-shown') }}>
            <GLBoundary onError={() => setLostNote('3D view unavailable, showing simple view')}>
              <Suspense fallback={null}>
                                  <HallScene3D hall={map.data.hall} taken={taken} selected={selected} focusSeat={focusSeat} hovered={hovered}
                    onPick={pick} onHover={setHovered} resetKey={resetKey} phone={isPhone()} instant={prefersReducedMotion()}
                    onContextLost={() => setLostNote('3D view paused, showing simple view')}
                  paused={curtain === 'opening'} fpsGuard={fpsGuard} fpsForceSlow={fpsSlow} onStillSlow={slowToast}
                  onReady={() => { performance.mark('lumen:hall-ready'); setThreeReady(true) }} />
              </Suspense>
            </GLBoundary>
          </div>
        )}
        {threeOn && threeReady && !lostNote && (
          <p data-view={focusSeat?.id ?? 'overview'} className="absolute bottom-20 left-3 rounded-full bg-bg/80 px-3 py-1 text-xs ring-1 ring-border md:bottom-4" aria-live="polite">
            {focusSeat ? `View from Row ${focusSeat.row}, Seat ${focusSeat.n}` : 'Overview · drag to look around'}
          </p>
        )}
      </div>

      {/* top bar (after curtains) */}
      <div className={cn('absolute inset-x-0 top-0 z-[45] flex h-14 items-center gap-2 bg-gradient-to-b from-black/70 px-3 transition-opacity duration-200', curtainsUp ? 'opacity-0' : 'opacity-100')}>
        <Link to={`/movie/${id}`} aria-label="Back to showtimes" className={iconBtn}><ArrowLeft className="size-4" aria-hidden /></Link>
        <div className="min-w-0 flex-1">
          {!curtainsUp && <h1 className="truncate font-display text-xl uppercase leading-tight tracking-wide md:text-2xl">{titleText}</h1>}
          <p className="truncate text-xs text-text-muted">{showLine}</p>
        </div>
        {threeOn && threeReady && !lostNote && (
          <button onClick={() => { setFocusSeat(null); setResetKey((k) => k + 1) }} aria-label="Reset view" className={iconBtn}>
            <RotateCcw className="size-4 md:size-3.5" aria-hidden /> <span className="hidden md:inline">Reset view</span>
          </button>
        )}
        {threeOn && !lostNote && (
          <button onClick={() => { localStorage.setItem('lumen.simple', '1'); setThreeOn(false) }} aria-label="Simple view" className={iconBtn}>
            <Eye className="size-4 md:size-3.5" aria-hidden /> <span className="hidden md:inline">Simple view</span>
          </button>
        )}
        {decision?.mode === 'on-demand' && !threeOn && (
          <button onClick={() => setThreeOn(true)} aria-label="Preview in 3D" className={iconBtn}><Box className="size-4" aria-hidden /> <span className="hidden md:inline">Preview in 3D</span></button>
        )}
      </div>

      {curtainsUp && <Curtains phase={curtain} progress={progress} hideLine={quick} onGone={() => { performance.mark('lumen:curtain-gone'); setCurtain('gone'); setTimeout(() => setSheetOpen(true), 200) }} />}
      {/* real-text overlay above the curtains (z-60): LCP is text, never the canvas */}
      {curtainsUp && (
        <div className={cn('fixed inset-0 z-[60] grid place-items-center p-6 text-center transition-opacity duration-200', curtain === 'opening' && 'pointer-events-none opacity-0')}>
          <div>
            <p className="font-display text-4xl tracking-[0.2em] text-[#F4F1EA] md:text-6xl">LUMEN<span className="ml-1 align-top font-sans text-[10px] tracking-normal text-text-muted">[PH]</span></p>
            <h1 className="mt-4 min-h-10 font-display text-4xl uppercase tracking-wide md:text-5xl">{titleText}</h1>
            <p className="min-h-5 text-sm text-[#F4F1EA]/80">{showLine}</p>
            <p className="mt-2 text-sm text-text-muted">Setting up the hall…</p>
            <Button className="mt-5 min-h-11" onClick={() => setCurtain('opening')}>Choose seats</Button>
          </div>
        </div>
      )}

      <SeatSheet open={sheetOpen && !curtainsUp} onCollapse={() => setSheetOpen(false)} title="Choose your seats" footer={
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm"><span className="font-semibold">{selected.length} seat{selected.length === 1 ? '' : 's'}</span> · {eur(total)} [PH]{selected.length > 0 && <span className="block truncate text-xs text-text-muted">{seatLabel}</span>}</p>
          <Button className="min-h-11" disabled={!selected.length} onClick={goBook}>Continue</Button>
        </div>
      }>
        {!map.data ? <div className="space-y-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-10 sm:h-6" />)}</div> : (
          <>
            <SeatMap2D hall={map.data.hall} taken={taken} selected={selected} price={price} onPick={pick} onHover={setHovered} shakeId={shake} compact={false} />
            <div className="mt-4"><SeatLegend /></div>
            {soldOut && <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">This show is sold out. <Link to={`/movie/${id}`} className="ml-1 text-accent underline">Try another time</Link></div>}
            {limitMsg && <p className="mt-3 text-sm text-danger" role="alert">You can book up to {MAX_SEATS} seats at once.</p>}
            {accessPicked && <p className="mt-3 rounded-xl bg-access/15 p-3 text-sm text-text">Wheelchair space — companion seat next to it is free [PH]</p>}
          </>
        )}
      </SeatSheet>
      {/* peek bar: sheet collapsed, never fully hidden. Reserved h-16, fixed bottom. */}
      {!sheetOpen && !curtainsUp && (
        <div className="fixed inset-x-0 bottom-0 z-[55] flex h-16 items-center gap-2 border-t border-border bg-surface/95 px-3 backdrop-blur md:inset-x-auto md:bottom-4 md:right-4 md:w-[min(480px,40vw)] md:rounded-2xl md:ring-1 md:ring-border">
          <button ref={peekRef} onClick={() => setSheetOpen(true)} className="min-h-11 min-w-0 flex-1 truncate text-left text-sm" aria-label={`Selected: ${seatLabel}. Open seat picker`}>
            <span className="font-semibold">{seatLabel}</span> · {eur(total)} [PH]
          </button>
          <Button variant="ghost" className="min-h-11" onClick={() => setSheetOpen(true)}>Change seats</Button>
          <Button className="min-h-11" disabled={!selected.length} onClick={goBook}>Continue</Button>
        </div>
      )}
    </div>
  )
}
