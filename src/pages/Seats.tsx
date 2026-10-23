import { lazy, Suspense, useEffect, useMemo, useRef, useState, Component, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Box, ChevronLeft, ChevronRight, LayoutGrid, RotateCcw, Users } from 'lucide-react'
import { createHold, getMovie, getSeatMap, listShows, isNotFound, MAX_SEATS, SeatTakenError, type Seat } from '@/lib/api'
import { rangeLabel } from '@/lib/group-label'
// fix12 (TBT): group placement maths load lazily, on the first tap / hover on the map or 3D preview, never at startup
type GroupLib = typeof import('@/lib/group')
let groupLib: GroupLib | null = null
const loadGroup = () => import('@/lib/group').then((m) => (groupLib = m))
import { useData } from '@/lib/useData'
import { useBooking } from '@/lib/booking'
import { decideThree, isPhone, type ThreeDecision } from '@/lib/device'
import { isHall3DReady } from '@/lib/prefetch3d'
import { cn, dayLabel, eur, prefersReducedMotion, time } from '@/lib/format'
import { Button, Container, ErrorCard, Skeleton } from '@/components/ui'
import { Curtains, type CurtainPhase } from '@/components/Curtains'
import { SeatSheet } from '@/components/SeatSheet'
import { resetSeatMapZoom, SeatLegend, SeatMap2D } from '@/components/SeatMap2D'
import { StepIndicator } from '@/components/Shows'
import { ViewFromSeatCard } from '@/components/ViewFromSeatCard'

const HallScene3D = lazy(() => import('@/three/HallScene3D'))

class GLBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

/** "Sat 25 Oct, 18:45" (§15.u expired-show toast) */
function fmtShowtime(iso: string) {
  const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0')
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}, ${p(d.getHours())}:${p(d.getMinutes())}`
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
  const [facing, setFacing] = useState<'left' | 'right' | null>(null) // fix15 §15.u rev 3 Screen chip
  // fix11 §15.y rev 3/3.1 group picking. partySize lives in booking state (the §13 tickets step will set it later).
  const qParty = Number(q.get('party')) || 0 // ?party=N presets the group size and skips step 1 (deep links / QA)
  const [partyStep, setPartyStep] = useState(() => !qParty && booking.seats.length === 0)
  useEffect(() => { if (qParty >= 1 && qParty <= MAX_SEATS && booking.partySize !== qParty) booking.setPartySize(qParty) }, [qParty]) // eslint-disable-line react-hooks/exhaustive-deps
  const [split, setSplit] = useState(false)          // "Split the group": taps add one seat at a time until partySize
  const [shortK, setShortK] = useState<number | null>(null) // "Only k seats together here" panel
  const [pulseRows, setPulseRows] = useState<Set<string> | undefined>()
  const [say, setSay] = useState('')                 // aria-live polite announcement
  const [extraTaken, setExtraTaken] = useState<string[]>([]) // SEAT_TAKEN at Continue
  const [mapKey, setMapKey] = useState(0)
  const [holding, setHolding] = useState(false)
  // fix13 §15.z rev 5: a 3D tap flies to that seat's point of view (focusSeat) and never selects; only "Add seat" selects
  const ignorePop = useRef(false)
  const pushedView = useRef(false) // a history entry was pushed when entering the seat view (browser back = Back to overview)
  const [hover2D, setHover2D] = useState<Seat | null>(null)
  const [G, setG] = useState<GroupLib | null>(groupLib)
  const leaving3D = useRef(false) // unmounting the canvas on a switch to Simple fires webglcontextlost; that is not a failure
  const needG = () => { if (!G) void loadGroup().then(setG) }
  useEffect(() => { if (booking.seats.length) needG() }, []) // eslint-disable-line react-hooks/exhaustive-deps
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
  // fix7: reduced motion -> no hall fade, the hall is simply there when the curtains are gone
  const reduceMotion = useMemo(() => prefersReducedMotion(), [])

  // No ?show= in the URL (e.g. a shared/bookmarked /movie/:id/seats link): pick the next bookable show
  // instead of dead-ending, keeping other params such as ?3d=1.
  // fix15.1: an expired or unknown ?show= (old shared link) falls forward to the next upcoming show of the same film
  // (history.replace, other params such as ?party= kept). The error card only shows when the film has no future shows.
  // fix15.2: ignore a stale result from the previous ?show= (data id must match; a show we just redirected to is never "gone"
  // until its own fetch says so), otherwise the redirect would chain through every showtime
  const redirectedTo = useRef<string | null>(null)
  const fresh = !!map.data && map.data.show.id === showId
  const showGone = !!showId && ((isNotFound(map.error) && redirectedTo.current !== showId) || (fresh && new Date(map.data!.show.start).getTime() <= Date.now()))
  useEffect(() => {
    if (showId && !showGone) return
    let live = true
    listShows({ movieId: id }).then((list) => {
      if (!live) return
      const open = list.filter((s) => !s.soldOut)
      const next = open.filter((s) => s.id !== showId).find((s) => new Date(s.start).getTime() > Date.now())
      // §15.u (designer wording): expired show -> next showtime + toast; none left -> movie page + toast. ?party / ?3d are kept.
      if (!next) {
        if (!showGone) return setNoShows(true)
        toast('That showing has ended.')
        return nav(`/movie/${id}`, { replace: true })
      }
      if (showGone) toast(`That showing has ended. Here's the next one, ${fmtShowtime(next.start)}.`)
      redirectedTo.current = next.id
      const p = new URLSearchParams(q); p.set('show', next.id)
      setQ(p, { replace: true })
    })
    return () => { live = false }
  }, [showId, showGone, id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (showId) booking.setShow(showId) }, [showId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    resetSeatMapZoom()
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
  // fix9: the prerendered static curtain (outside #root, see scripts/prerender.ts) goes once the real curtains are gone
  useEffect(() => { if (curtain === 'gone') document.getElementById('seat-static')?.remove() }, [curtain])
  useEffect(() => () => document.getElementById('seat-static')?.remove(), [])
  // fix15.1 (QA blocker): the static curtain must also clear on every non-hall outcome (no shows, load error), or it covers the error card
  useEffect(() => { if (noShows || (map.error && !showGone)) document.getElementById('seat-static')?.remove() }, [noShows, map.error, showGone])
  // fix13 (SEO LCP): the curtain (.velvet-static) stays flat #7A1F2B for the whole load; the velvet tile painted late and became the LCP element
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

  const taken = useMemo(() => new Set([...(map.data?.taken ?? []), ...extraTaken]), [map.data, extraTaken])
  const seatsById = useMemo(() => new Map(map.data?.hall.rows.flatMap((r) => r.seats.map((s) => [s.id, s] as const)) ?? []), [map.data])
  const selected = booking.showId === showId ? booking.seats : []
  const price = map.data?.show.price ?? 0
  const lastSelected = focusSeat ?? (selected.length ? seatsById.get(selected[selected.length - 1]) ?? null : null)

  const party = booking.partySize
  const announce = (ids: string[]) => setSay(ids.length ? `${rangeLabel(ids, seatsById)} selected, ${ids.length} seat${ids.length === 1 ? '' : 's'} [PH]` : 'No seats selected [PH]')
  function pick(seat: Seat) {
    if (!G) { void loadGroup().then((m) => { setG(m); pickWith(m, seat) }); return }
    pickWith(G, seat)
  }
  function pickWith(G: GroupLib, seat: Seat) {
    if (taken.has(seat.id)) {
      setShake(seat.id); setTimeout(() => setShake(null), 600)
      toast("That seat's taken")
      return
    }
    if (split) {
      // Split mode: one seat per tap (wheelchair spaces only here), tap a picked seat to remove it
      if (selected.includes(seat.id)) {
        const ids = selected.filter((x) => x !== seat.id); booking.setSeats(ids); setLimitMsg(false); announce(ids)
        return
      }
      if (selected.length >= party) { setLimitMsg(true); setTimeout(() => setLimitMsg(false), 3000); return }
      const ids = [...selected, seat.id]; booking.setSeats(ids); announce(ids)
      if (ids.length === party) setShortK(null)
      return
    }
    if (selected.includes(seat.id)) return // tapping a seat already in the block does nothing
    const g = G.placeGroup(map.data!.hall, seat, party, taken)
    if (!g.ids.length) { // wheelchair space in group mode: never auto-included
      setShortK(0); setSay('Wheelchair spaces are picked one at a time. Choose Split the group [PH]'); return
    }
    booking.setSeats(g.ids)
    if (g.short) { setShortK(g.ids.length); setSay(`Only ${g.ids.length} seat${g.ids.length === 1 ? '' : 's'} together here [PH]`) }
    else { setShortK(null); announce(g.ids) }
    // §11.4: the sheet collapses to the peek bar after a full pick; fix12: it stays open on a short run (Find/Split panel is 2D-only)
    if (!g.short) setSheetOpen(false)
  }
  const shiftL = G && map.data && !split && selected.length === party ? G.shiftTarget(map.data.hall, selected, -1, taken, seatsById) : null
  const shiftR = G && map.data && !split && selected.length === party ? G.shiftTarget(map.data.hall, selected, 1, taken, seatsById) : null
  function shift(dir: -1 | 1) {
    const t = dir === 1 ? shiftR : shiftL
    if (!t || selected.length < party) return
    if (!G) return
    const ids = G.shiftGroup(selected, dir, t, seatsById); booking.setSeats(ids); announce(ids)
  }
  // fix12: map back to fit only; the camera never re-centres automatically (Reset view is the only way back)
  function toFit() { resetSeatMapZoom(); setMapKey((k) => k + 1) }
  function clearPicks() { booking.releaseHold(); booking.setSeats([]); setSplit(false); setShortK(null); setLimitMsg(false); toFit() }
  function changeSeats() { clearPicks(); setSay('Pick a seat for your group [PH]'); setSheetOpen(true) }
  function findTogether() {
    clearPicks(); setSheetOpen(true)
    const rows = new Set(G ? G.rowsWithRun(map.data!.hall, party, taken) : []); setPulseRows(rows); setTimeout(() => setPulseRows(undefined), 1500)
    setSay(rows.size ? `Rows ${[...rows].join(', ')} have ${party} seats together [PH]` : `No ${party} seats together for this show [PH]`)
  }
  function startSplit() { setSplit(true); setShortK(null); setSay(`${selected.length} of ${party} picked. Tap to add the rest one at a time [PH]`); setSheetOpen(true) }
  /** fix13 §15.z rev 5: 3D tap = fly to that seat's view (400ms ease-out, instant under reduced motion). Nothing is selected.
   *  Taken / wheelchair seats can be viewed too; Add seat is then disabled with the reason. */
  function viewSeat(seat: Seat) {
    needG()
    if (!focusSeat && !pushedView.current) { history.pushState({ ...history.state, lumenSeatView: true }, ''); pushedView.current = true }
    setFocusSeat(seat); setSay(`Viewing from ${seat.id}. Press Add seat to select. [PH]`)
  }
  /** Back to overview (button, Esc, browser back): glide to the overview, nothing selected */
  function exitView(fromPop = false) {
    if (!focusSeat) return
    // fix13: drop our history entry and exit right away; the popstate this causes is ignored (a second Back/Esc can never leave the page)
    if (!fromPop && pushedView.current) { ignorePop.current = true; history.back() }
    pushedView.current = false
    setFocusSeat(null); setResetKey((k) => k + 1); setSay('Overview [PH]')
  }
  useEffect(() => {
    const pop = () => { if (ignorePop.current) { ignorePop.current = false; return } if (pushedView.current) { pushedView.current = false; setFocusSeat(null); setResetKey((k) => k + 1); setSay('Overview [PH]') } }
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop)
  }, [])
  useEffect(() => {
    if (!focusSeat || sheetOpen) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); exitView() } }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  // back end correction: only taken seats block Add seat; access seats (J1, J2, J15, J16) stay addable with a hint
  const viewBlock = focusSeat && taken.has(focusSeat.id) ? 'Taken [PH]' : null
  const viewHint = focusSeat && !viewBlock && focusSeat.type === 'access' ? 'Needs a Disability ticket [PH]' : null
  /** the only way a 3D seat gets selected. party 1: select it ("F9 selected" + Continue). party >= 2: place the group (§15.y), open the 2D map. */
  function addSeat() {
    const s = focusSeat; if (!s || !map.data || viewBlock) return
    booking.releaseHold(); setSplit(false)
    if (party === 1) { booking.setSeats([s.id]); setShortK(null); setSay(`${s.id} selected. Press Continue. [PH]`); return }
    const run = (G: GroupLib) => {
      const g = G.placeGroup(map.data!.hall, s, party, taken)
      if (!g.ids.length) { booking.setSeats([s.id]); setSplit(true); setShortK(null); setSay(`${s.id} added. Wheelchair spaces are picked one at a time, tap to add the rest [PH]`); setSheetOpen(true); return }
      booking.setSeats(g.ids)
      if (g.short) { setShortK(g.ids.length); setSay(`Only ${g.ids.length} seat${g.ids.length === 1 ? '' : 's'} together here [PH]`) } else { setShortK(null); announce(g.ids) }
      setSheetOpen(true)
    }
    if (G) run(G); else void loadGroup().then((m) => { setG(m); run(m) })
  }
  async function goContinue() {
    const ids = selected
    if (ids.length !== party || holding) return
    setHolding(true)
    try {
      const h = await createHold(showId, ids); booking.setHold(h.id, h.holdExpiresAt); nav('/booking')
    } catch (e) {
      if (e instanceof SeatTakenError) {
        const lost = e.seatIds
        toast(lost.length === 1 ? `${lost[0]} was just taken, pick another [PH]` : `${lost.slice(0, -1).join(', ')} and ${lost[lost.length - 1]} were just taken [PH]`, { duration: 6000, closeButton: true })
        setExtraTaken((x) => [...x, ...lost]); booking.setSeats([]); setSplit(false); setShortK(null) // camera stays on that row
        setSay(`${lost.join(', ')} just taken, pick again [PH]`)
      } else toast("Couldn't reach the cinema, try again [PH]")
    } finally { setHolding(false) }
  }
  const noRun = !!G && !!map.data && partyStep && G.rowsWithRun(map.data.hall, party, taken).length === 0
  const ghost = !split && hover2D && map.data && !selected.includes(hover2D.id) && !taken.has(hover2D.id) && G ? new Set(G.placeGroup(map.data.hall, hover2D, party, taken).ids) : undefined
  const groupLabel = !selected.length ? 'Pick a seat for your group [PH]' : selected.length < party ? `${selected.length} of ${party} picked [PH]` : `${rangeLabel(selected, seatsById).replace(' to ', '-')} · ${selected.length} seat${selected.length === 1 ? '' : 's'} [PH]`

  if (!showId || showGone) return (
    <Container className="min-h-[115svh] py-10">
      {noShows ? <ErrorCard message="No bookable showtimes for this film." onRetry={() => nav(`/movie/${id}`)} /> : <Skeleton className="h-96" />}
    </Container>
  )
  // fix15.2: a transient (network/5xx) error stays on this page; party size, picks and the hold live in state/booking and survive Try again
  if (map.error) return <Container className="py-16"><ErrorCard message="Couldn't load seats. Check your connection." onRetry={map.retry} /></Container>

  const show = map.data?.show
  const soldOut = !!map.data && map.data.hall.rows.every((r) => r.seats.every((s) => taken.has(s.id)))
  const accessPicked = selected.some((s) => seatsById.get(s)?.type === 'access')
  const fallback = !threeOn || !!lostNote
  const total = selected.length * price

  const noGL = decision?.reason === 'Your browser has 3D turned off'
  /** fix12 §15.w: switch keeps party, picks and hold; flips ?simple=1 with replaceState; persists (lumen.simple); never locks into Simple */
  function setView(v: '3d' | 'simple') {
    const u = new URL(location.href)
    if (v === 'simple') { leaving3D.current = true; localStorage.setItem('lumen.simple', '1'); u.searchParams.set('simple', '1'); setThreeOn(false) }
    else {
      localStorage.removeItem('lumen.simple'); u.searchParams.delete('simple'); sessionStorage.removeItem('lumen.slowtoast') // fps toast may show again
      leaving3D.current = false; setLostNote(null); setThreeOn(true)
    }
    history.replaceState(history.state, '', u.pathname + u.search + u.hash)
    setSay(v === 'simple' ? 'Simple view [PH]' : '3D view [PH]')
  }
  function slowToast() {
    if (sessionStorage.getItem('lumen.slowtoast') === '1') return
    sessionStorage.setItem('lumen.slowtoast', '1')
    toast('Running slow? Switch to simple view', {
      position: 'bottom-center', className: 'mb-16', duration: Infinity, closeButton: true,
      action: { label: 'Switch', onClick: () => setView('simple') },
    })
  }
  const seatLabel = groupLabel
  // peek bar: line 1 seats, line 2 count + price (fits next to the buttons at 390px)
  const full = selected.length === party && selected.length > 0
  const peekTop = full ? rangeLabel(selected, seatsById).replace(' to ', '-') : groupLabel
  const peekSub = full ? `${selected.length} seat${selected.length === 1 ? '' : 's'} · ${eur(total)} [PH]` : `${eur(total)} [PH]`
  const showLine = show ? `${dayLabel(show.start)} · ${time(show.start)} · ${show.format} · ${map.data?.hall.name}` : '\u00a0'
  const curtainsUp = curtain !== 'gone'
  const titleText = <>{movie.data?.title ?? '…'} <span className="text-base text-text-muted">[PH]</span></>
  const iconBtn = 'inline-flex size-11 items-center justify-center gap-1 rounded-full bg-bg/70 text-xs ring-1 ring-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:w-auto md:px-3'

  return (
    <div className="fixed inset-0 z-40 h-[100svh] overflow-hidden bg-bg" aria-busy={threeOn && !threeReady && !lostNote}>
      <p data-say aria-live="polite" className="sr-only">{say}</p>
      <p role="status" className="sr-only">{fallback ? 'Showing simple seat view' : threeReady ? '3D preview ready' : 'Loading the 3D seat preview'}</p>
      {/* hall layer: 3D canvas, or the static view-from-seat card (fallback) */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#2a0d12,#0B0B0F_70%)]">
        {map.data && fallback && (
          <div className="absolute inset-0 grid place-items-center p-4 pb-20 pt-16 md:pr-[calc(min(480px,40vw)+32px)]">
            <div className="w-full max-w-3xl"><ViewFromSeatCard seat={lastSelected} hall={map.data.hall} note={lostNote ?? (decision?.mode === 'off' ? decision.reason : undefined)} /></div>
          </div>
        )}
        {map.data && threeOn && idle && !lostNote && (curtain !== 'opening' || hallMounted.current) && (hallMounted.current = true) && (
          <div className={cn('absolute inset-0', !reduceMotion && 'transition-opacity duration-500', threeReady && !curtainsUp ? 'opacity-100' : 'invisible opacity-0')}
            onTransitionEnd={(e) => { if (!reduceMotion && e.target === e.currentTarget && threeReady && !performance.getEntriesByName('lumen:hall-shown').length) performance.mark('lumen:hall-shown') }}>
            <GLBoundary onError={() => setLostNote('3D view unavailable, showing simple view')}>
              <Suspense fallback={null}>
                                  <HallScene3D hall={map.data.hall} taken={taken} selected={selected} focusSeat={focusSeat} hovered={hovered}
                    preview={focusSeat} onPick={viewSeat} onHover={setHovered} resetKey={resetKey} onFacing={setFacing} phone={isPhone()} instant={prefersReducedMotion()}
                    onContextLost={() => { if (!leaving3D.current) setLostNote('3D view paused, showing simple view') }}
                  paused={curtain === 'opening'} applyLooks={curtain === 'gone'} fpsGuard={fpsGuard} fpsForceSlow={fpsSlow} onStillSlow={slowToast}
                  onReady={() => { performance.mark('lumen:hall-ready'); setThreeReady(true) }} />
              </Suspense>
            </GLBoundary>
          </div>
        )}
        {threeOn && threeReady && !lostNote && (
          <button type="button" aria-label="Turn to face the screen" data-screen-chip={facing ?? 'hidden'} onClick={() => setResetKey((k) => k + 1)} aria-hidden={!facing} tabIndex={facing ? 0 : -1}
            // fix15.3 (QA blocker): with the desktop seat sheet open, a right-side chip sat under the sheet (z-55) and the click hit the sheet.
            // Sheet open on desktop -> pinned top-centre of the canvas area (top-4 below the h-14 top bar, which overlays the canvas), above the canvas, below dialogs; tap = Reset, sheet stays open.
            className={cn('absolute z-20 h-8 rounded-full bg-black/60 px-3 text-xs text-white',
              sheetOpen && !isPhone() ? 'left-1/2 top-[4.5rem] -translate-x-1/2' : cn('top-1/2 -translate-y-1/2', facing === 'right' ? 'right-3' : 'left-3'),
              !reduceMotion && 'transition-opacity duration-150', facing ? 'opacity-100' : 'pointer-events-none opacity-0')}>
            {facing === 'left' ? '‹ Screen' : 'Screen ›'}
          </button>
        )}
        {threeOn && threeReady && !lostNote && (
          <p data-view={focusSeat?.id ?? 'overview'} className="absolute bottom-20 left-3 rounded-full bg-bg/80 px-3 py-1 text-xs ring-1 ring-border md:bottom-4" aria-live="polite">
            {focusSeat ? `View from Row ${focusSeat.row}, Seat ${focusSeat.n}` : 'Overview · drag to look around'}
          </p>
        )}
      </div>

      {/* top bar (after curtains) */}
      <div className={cn('absolute inset-x-0 top-0 z-[45] flex h-14 items-center gap-2 bg-gradient-to-b from-black/70 px-3 transition-opacity duration-200', curtainsUp ? 'opacity-0' : 'opacity-100')}>
        {focusSeat && threeOn && !lostNote
          ? <button type="button" data-back-overview onClick={() => exitView()} aria-label="Back to overview" className={cn(iconBtn, 'w-auto px-3 text-sm')}><ChevronLeft className="size-4" aria-hidden /><span className="hidden sm:inline">Back to overview</span><span className="sm:hidden">Back</span></button>
          : <Link to={`/movie/${id}`} aria-label="Back to showtimes" className={iconBtn}><ArrowLeft className="size-4" aria-hidden /></Link>}
        <div className="min-w-0 flex-1">
          {!curtainsUp && <h1 className="truncate font-display text-xl uppercase leading-tight tracking-wide md:text-2xl">{titleText}</h1>}
          <p className="truncate text-xs text-text-muted">{showLine}</p>
        </div>
        {threeOn && threeReady && !lostNote && (
          <button onClick={() => setResetKey((k) => k + 1)} aria-label="Reset view" title={focusSeat ? `Back to ${focusSeat.id}'s default angle` : undefined} className={iconBtn}>
            <RotateCcw className="size-4 md:size-3.5" aria-hidden /> <span className="hidden md:inline">Reset view</span>
          </button>
        )}
        {/* fix12 §15.w: Hall view switch, 3D | Simple, always visible (phone + desktop) */}
        <div role="radiogroup" aria-label="Hall view" data-viewswitch className="flex shrink-0 items-center rounded-full bg-bg/70 p-0.5 ring-1 ring-border">
          {([['3d', '3D', Box], ['simple', 'Simple', LayoutGrid]] as const).map(([v, label, Icon]) => {
            const on = v === '3d' ? !fallback : fallback
            const disabled = v === '3d' && noGL
            return (
              <label key={v} title={disabled ? 'Your browser has 3D turned off' : undefined}
                className={cn('relative inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-medium after:absolute after:-inset-x-0.5 after:-inset-y-1 after:content-[""] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
                  on ? 'bg-accent text-accent-fg' : 'text-text hover:bg-surface-2', disabled && 'cursor-not-allowed opacity-50')}>
                <input type="radio" name="hallview" value={v} checked={on} disabled={disabled} onChange={() => setView(v)} className="sr-only" />
                <Icon className="size-4" aria-hidden />{label}
              </label>
            )
          })}
        </div>
      </div>

      {curtainsUp && <Curtains phase={curtain} progress={progress} hideLine={quick} onGone={() => { performance.mark('lumen:curtain-gone'); if (reduceMotion && threeReady) performance.mark('lumen:hall-shown'); setCurtain('gone'); setTimeout(() => setSheetOpen(true), 200) }} />}
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

      <SeatSheet open={sheetOpen && !curtainsUp} onCollapse={() => setSheetOpen(false)} title={partyStep ? 'How many people? [PH]' : 'Choose your seats'} footer={partyStep ? (
        <Button className="min-h-11 w-full" onClick={() => { setPartyStep(false); setSay(`Pick a seat for your group of ${party} [PH]`) }}>Choose seats [PH]</Button>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-sm"><span data-card className="font-semibold">{seatLabel}</span>{selected.length > 0 && <> · {eur(total)} [PH]</>}</p>
          {!split && selected.length === party && <ShiftButtons onShift={shift} canL={!!shiftL} canR={!!shiftR} />}
          <Button className="min-h-11" disabled={selected.length !== party || holding} onClick={goContinue}>Continue</Button>
        </div>
      )}>
        {partyStep ? (
          <fieldset data-party-step>
            <legend className="sr-only">How many people? [PH]</legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {Array.from({ length: MAX_SEATS }, (_, i) => i + 1).map((n) => (
                <label key={n} className="relative">
                  <input type="radio" name="party" value={n} checked={party === n} onChange={() => { needG(); booking.setPartySize(n) }} className="peer sr-only" />
                  <span className="grid min-h-11 cursor-pointer place-items-center rounded-xl bg-surface-2 text-xl font-semibold tabular-nums ring-1 ring-border peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{n}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 min-h-5 text-sm text-text-muted">{noRun ? `No ${party} seats together, we'll help you split [PH]` : ''}</p>
          </fieldset>
        ) : !map.data ? <div className="space-y-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-10 sm:h-6" />)}</div> : (
          <>
            {/* fix13 designer ruling: sheet open + 3D seat view -> the sheet's top row is the peek content (no second bar) */}
            {focusSeat && threeOn && !lostNote && !(party === 1 && selected.includes(focusSeat.id)) && (
              <div data-sheet-seatview={focusSeat.id} className="mb-3 flex items-center gap-2 rounded-2xl bg-surface-2 p-2 pl-3 ring-1 ring-border">
                <p className="min-w-0 flex-1 text-sm leading-tight"><span className="block truncate font-semibold">Seat {focusSeat.id} · Row {focusSeat.row} · {eur(price)} [PH]</span>
                  {viewHint && <span className="block truncate text-xs text-text-muted">{viewHint}</span>}</p>
                <Button className="min-h-11 shrink-0" disabled={!!viewBlock} onClick={addSeat}>{viewBlock ?? (party === 1 ? 'Add seat' : 'Add seat & place group')}</Button>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between gap-2">
              <button type="button" data-party-chip onClick={() => { clearPicks(); setPartyStep(true) }} 
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm ring-1 ring-border hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <Users className="size-4" aria-hidden /> {party} {party === 1 ? 'person' : 'people'} [PH]<span className="sr-only">, change group size</span>
              </button>
              {!selected.length && <p data-pick-prompt className="text-sm text-text-muted">Pick a seat for your group [PH]</p>}
              {split && selected.length < party && <p className="text-sm text-text-muted">{selected.length} of {party} picked [PH]</p>}
            </div>
            {shortK !== null && <ShortPanel k={shortK} party={party} onFind={findTogether} onSplit={startSplit} />}
            <SeatMap2D key={mapKey} preview={ghost} pulseRows={pulseRows} onShift={shift} hall={map.data.hall} taken={taken} selected={selected} price={price} onPick={pick} onHover={(s) => { needG(); setHover2D(s); setHovered(s) }} shakeId={shake} compact={false} />
            <div className="mt-4"><SeatLegend /></div>
            {soldOut && <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">This show is sold out. <Link to={`/movie/${id}`} className="ml-1 text-accent underline">Try another time</Link></div>}
            {limitMsg && <p className="mt-3 text-sm text-danger" role="alert">{party >= MAX_SEATS ? `Max ${MAX_SEATS} seats per booking [PH]` : `All ${party} seats picked. Tap one to remove it first [PH]`}</p>}
            {accessPicked && <p className="mt-3 rounded-xl bg-access/15 p-3 text-sm text-text">Wheelchair space — companion seat next to it is free [PH]</p>}
          </>
        )}
      </SeatSheet>
      {/* peek bar: sheet collapsed, never fully hidden. Reserved h-16, fixed bottom. */}
      {!sheetOpen && !curtainsUp && (!partyStep || focusSeat) && (
        <div className="fixed inset-x-0 bottom-0 z-[55] flex h-16 items-center gap-2 border-t border-border bg-surface/95 px-3 backdrop-blur md:inset-x-auto md:bottom-4 md:right-4 md:w-[min(480px,40vw)] md:rounded-2xl md:ring-1 md:ring-border">
          {focusSeat && threeOn && !lostNote && !(party === 1 && selected.includes(focusSeat.id)) ? <>
            <button ref={peekRef} data-seatview={focusSeat.id} onClick={() => setSheetOpen(true)} className="min-h-11 min-w-0 flex-1 text-left text-sm leading-tight" aria-label={`Seat ${focusSeat.id}, row ${focusSeat.row}, ${eur(price)}. Open seat picker`}>
              <span className="block truncate font-semibold">Seat {focusSeat.id} · Row {focusSeat.row} · {eur(price)} [PH]</span>
              {viewHint && <span data-seat-hint className="block truncate text-xs text-text-muted">{viewHint}</span>}
            </button>
            <Button data-add-seat className="min-h-11 shrink-0" disabled={!!viewBlock} onClick={addSeat}>{viewBlock ? <span data-block-reason>{viewBlock}</span> : party === 1 ? 'Add seat' : 'Add seat & place group'}</Button>
          </> : <>
            <button ref={peekRef} onClick={() => setSheetOpen(true)} className="min-h-11 min-w-0 flex-1 text-left text-sm leading-tight" aria-label={`Selected: ${seatLabel}. Open seat picker`}>
              <span className="block truncate font-semibold">{peekTop}</span><span className="block truncate text-xs text-text-muted">{peekSub}</span>
            </button>
            <Button variant="ghost" className="min-h-11" onClick={changeSeats} aria-label="Change seats: clear your picks and choose again"><span className="sm:hidden">Change</span><span className="hidden sm:inline">Change seats</span></Button>
            <Button className="min-h-11" disabled={selected.length !== party || holding} onClick={goContinue}>Continue</Button>
          </>}
        </div>
      )}
    </div>
  )
}

/** fix11 §15.y: short run panel */
function ShortPanel({ k, party, onFind, onSplit }: { k: number; party: number; onFind: () => void; onSplit: () => void }) {
  return (
    <div data-short className="mb-3 rounded-2xl bg-surface-2 p-3 ring-1 ring-border">
      <p className="text-sm font-semibold">{k ? `Only ${k} seat${k === 1 ? '' : 's'} together here [PH]` : 'Wheelchair spaces are picked one at a time [PH]'}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button className="min-h-11" onClick={onFind}>Find {party} together [PH]</Button>
        <Button variant="ghost" className="min-h-11" onClick={onSplit}>Split the group [PH]</Button>
      </div>
    </div>
  )
}

function ShiftButtons({ onShift, canL, canR }: { onShift: (d: -1 | 1) => void; canL: boolean; canR: boolean }) {
  const c = 'grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-border disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
  return <>
    <button type="button" data-shift="-1" onClick={() => onShift(-1)} disabled={!canL} aria-label="Move group one seat left" className={c}><ChevronLeft className="size-5" aria-hidden /></button>
    <button type="button" data-shift="1" onClick={() => onShift(1)} disabled={!canR} aria-label="Move group one seat right" className={c}><ChevronRight className="size-5" aria-hidden /></button>
  </>
}
