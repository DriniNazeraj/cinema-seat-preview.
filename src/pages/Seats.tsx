import { lazy, Suspense, useEffect, useMemo, useState, Component, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Box, Eye, RotateCcw } from 'lucide-react'
import { getMovie, getSeatMap, MAX_SEATS, type Seat } from '@/lib/api'
import { useData } from '@/lib/useData'
import { useBooking } from '@/lib/booking'
import { decideThree, isPhone, type ThreeDecision } from '@/lib/device'
import { cn, dayLabel, eur, prefersReducedMotion, time } from '@/lib/format'
import { Button, Card, Container, ErrorCard, Skeleton } from '@/components/ui'
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
  const [q] = useSearchParams()
  const showId = q.get('show') ?? ''
  const nav = useNavigate()
  const booking = useBooking()
  const map = useData(`seatmap:${showId}`, () => getSeatMap(showId))
  const movie = useData(`movie:${id}`, () => getMovie(id))

  const [decision, setDecision] = useState<ThreeDecision | null>(null)
  const [threeOn, setThreeOn] = useState(false)
  const [threeReady, setThreeReady] = useState(false)
  const [lostNote, setLostNote] = useState<string | null>(null)
  const [focusSeat, setFocusSeat] = useState<Seat | null>(null)
  const [hovered, setHovered] = useState<Seat | null>(null)
  const [shake, setShake] = useState<string | null>(null)
  const [limitMsg, setLimitMsg] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => { if (showId) booking.setShow(showId) }, [showId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const d = decideThree()
    setDecision(d)
    setThreeOn(d.mode === 'auto')
  }, [])
  useEffect(() => { if (movie.data) document.title = `Choose seats · ${movie.data.title} [PH] | Lumen Cinema [PH]` }, [movie.data])

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
      if (focusSeat?.id === seat.id) setFocusSeat(null)
      return
    }
    if (selected.length >= MAX_SEATS) { setLimitMsg(true); return }
    booking.toggleSeat(seat.id)
    setFocusSeat(seat)
  }

  if (!showId) return <Container className="py-16"><ErrorCard message="No showtime picked." onRetry={() => nav(`/movie/${id}`)} /></Container>
  if (map.error) return <Container className="py-16"><ErrorCard onRetry={map.retry} /></Container>

  const show = map.data?.show
  const soldOut = !!map.data && map.data.hall.rows.every((r) => r.seats.every((s) => taken.has(s.id)))
  const accessPicked = selected.some((s) => seatsById.get(s)?.type === 'access')
  const fallback = !threeOn || !!lostNote
  const total = selected.length * price

  const view = (
    <div className={cn('relative overflow-hidden rounded-xl bg-surface ring-1 ring-border', 'aspect-video max-h-[40svh] w-full lg:aspect-[16/10] lg:max-h-none', collapsed && 'hidden lg:block')}>
      {map.data && fallback && (
        <div className="absolute inset-0">
          <ViewFromSeatCard seat={lastSelected} hall={map.data.hall} note={lostNote ?? (decision?.mode === 'off' ? decision.reason : undefined)} />
          {decision?.mode === 'on-demand' && !threeOn && (
            <Button className="absolute right-3 top-3" onClick={() => setThreeOn(true)}><Box className="size-4" /> Preview in 3D</Button>
          )}
        </div>
      )}
      {map.data && threeOn && !lostNote && (
        <div className={cn('absolute inset-0 transition-opacity duration-500', threeReady ? 'opacity-100' : 'opacity-0')}>
          <GLBoundary onError={() => setLostNote('3D view unavailable, showing simple view')}>
            <Suspense fallback={null}>
              <ThreeMount onReady={() => setThreeReady(true)}>
                <HallScene3D hall={map.data.hall} taken={taken} selected={selected} focusSeat={focusSeat} hovered={hovered}
                  onPick={pick} onHover={setHovered} resetKey={resetKey} phone={isPhone()} instant={prefersReducedMotion()}
                  onContextLost={() => setLostNote('3D view paused, showing simple view')} />
              </ThreeMount>
            </Suspense>
          </GLBoundary>
        </div>
      )}
      {threeOn && !threeReady && !lostNote && (
        <div className="absolute inset-0 grid place-items-center"><Skeleton className="absolute inset-0 rounded-none" /><p className="relative text-sm text-text-muted">Loading the hall…</p></div>
      )}
      {threeOn && threeReady && !lostNote && (
        <>
          <button onClick={() => { setFocusSeat(null); setResetKey((k) => k + 1) }} className="absolute right-3 top-3 inline-flex min-h-9 items-center gap-1 rounded-full bg-bg/80 px-3 text-xs ring-1 ring-border hover:bg-surface-2">
            <RotateCcw className="size-3.5" /> Reset view
          </button>
          <p className="absolute bottom-3 left-3 rounded-full bg-bg/80 px-3 py-1 text-xs ring-1 ring-border" aria-live="polite">
            {focusSeat ? `View from Row ${focusSeat.row}, Seat ${focusSeat.n}` : 'Overview · drag to look around'}
          </p>
        </>
      )}
      {threeOn && !lostNote && (
        <button onClick={() => { localStorage.setItem('lumen.simple', '1'); setThreeOn(false) }} className="absolute bottom-3 right-3 inline-flex min-h-9 items-center gap-1 rounded-full bg-bg/80 px-3 text-xs ring-1 ring-border hover:bg-surface-2">
          <Eye className="size-3.5" /> Simple view
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-[115svh] pb-28 lg:pb-12">
      <div className="sticky top-16 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <Container className="flex h-12 items-center overflow-x-auto"><StepIndicator step={1} /></Container>
      </div>
      <Container className="pt-6">
        <div className="mb-4">
          <Link to={`/movie/${id}`} className="text-sm text-text-muted hover:text-text">← Back to showtimes</Link>
          <h1 className="font-display text-4xl uppercase tracking-wide md:text-5xl">{movie.data?.title ?? '…'} <span className="text-base text-text-muted">[PH]</span></h1>
          {show && <p className="text-sm text-text-muted">{dayLabel(show.start)} · {time(show.start)} · {show.format} · {map.data?.hall.name}</p>}
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="lg:sticky lg:top-32 lg:flex-1">
            {view}
            <button className="mt-2 text-xs text-text-muted underline lg:hidden" onClick={() => setCollapsed((c) => !c)}>{collapsed ? 'Show preview view' : 'Hide preview to make room'}</button>
          </div>
          <Card className="p-4 lg:w-[440px]">
            {!map.data ? <div className="space-y-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-10 sm:h-6" />)}</div> : (
              <>
                <SeatMap2D hall={map.data.hall} taken={taken} selected={selected} price={price} onPick={pick} onHover={setHovered} shakeId={shake} compact={false} />
                <div className="mt-4"><SeatLegend /></div>
                {soldOut && (
                  <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">This show is sold out. <Link to={`/movie/${id}`} className="ml-1 text-accent underline">Try another time</Link></div>
                )}
                {limitMsg && <p className="mt-3 text-sm text-danger" role="alert">You can book up to {MAX_SEATS} seats at once.</p>}
                {accessPicked && <p className="mt-3 rounded-xl bg-access/15 p-3 text-sm text-text">Wheelchair space — companion seat next to it is free [PH]</p>}
                <div className="mt-4 hidden border-t border-border pt-4 lg:block">
                  <p className="text-sm text-text-muted">Your seats</p>
                  <div className="mt-2 flex min-h-8 flex-wrap gap-2">
                    {selected.length ? selected.map((s) => <span key={s} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-fg">{s}</span>) : <span className="text-sm text-text-muted">None yet</span>}
                  </div>
                  <div className="mt-4 flex items-center justify-between"><span className="text-text-muted">Total</span><span className="text-xl font-semibold">{eur(total)} <span className="text-xs text-text-muted">[PH]</span></span></div>
                  <Button className="mt-4 w-full" disabled={!selected.length} onClick={() => { booking.startHold(); nav('/booking') }}>Continue</Button>
                </div>
              </>
            )}
          </Card>
        </div>
      </Container>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        <Container className="flex items-center justify-between gap-3 py-3">
          <p className="text-sm"><span className="font-semibold">{selected.length} seat{selected.length === 1 ? '' : 's'}</span> · {eur(total)} [PH]{selected.length > 0 && <span className="block text-xs text-text-muted">{selected.join(', ')}</span>}</p>
          <Button disabled={!selected.length} onClick={() => { booking.startHold(); nav('/booking') }}>Continue</Button>
        </Container>
      </div>
    </div>
  )
}

function ThreeMount({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(() => { const t = setTimeout(onReady, 150); return () => clearTimeout(t) }, [onReady])
  return <>{children}</>
}
