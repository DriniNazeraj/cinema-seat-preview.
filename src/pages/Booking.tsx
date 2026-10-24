import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Lock, Minus, Plus, Timer } from 'lucide-react'
import {
  AccessSeatMismatchError,
  BookingInputSchema,
  ChildOnlyBookingError,
  createBooking,
  getMovie,
  getShow,
  getTicketPriceEur,
  isAccessSeatId,
  type TicketSelection,
} from '@/lib/api'
import { useBooking } from '@/lib/booking'
import { useData } from '@/lib/useData'
import { cn, dayLabel, eur, time } from '@/lib/format'
import { Button, ButtonLink, Card, Container } from '@/components/ui'
import { StepIndicator } from '@/components/Shows'

function HoldTimer({ until, onExpire }: { until: number; onExpire: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const left = Math.max(0, Math.round((until - now) / 1000))
  useEffect(() => { if (left === 0) onExpire() }, [left]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <p className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-sm tabular-nums" aria-live="off">
      <Timer className="size-4 text-accent" aria-hidden /> Seats held for {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
    </p>
  )
}

export default function BookingPage() {
  const b = useBooking()
  const nav = useNavigate()
  const show = useData(`show:${b.showId}`, () => (b.showId ? getShow(b.showId) : Promise.resolve(null)))
  const movie = useData(`movie:${show.data?.movieId ?? ''}`, () => (show.data ? getMovie(show.data.movieId) : Promise.resolve(null)))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [ticketServerErr, setTicketServerErr] = useState<string | null>(null)
  const [mismatchSeatIds, setMismatchSeatIds] = useState<string[]>([])

  useEffect(() => setMounted(true), [])

  // §13.b: partition held seats in hold order into locked access seats (J1, J2, J15, J16) vs standard seats (m, includes companion J3/J14)
  const accessSeats = useMemo(() => b.seats.filter((s) => isAccessSeatId(s)), [b.seats])
  const standardSeats = useMemo(() => b.seats.filter((s) => !isAccessSeatId(s)), [b.seats])
  const m = standardSeats.length
  const disabledCount = accessSeats.length

  // Standard pool: adultCount + childCount === m; default all m standard seats to Adult
  const [childCount, setChildCount] = useState(0)
  useEffect(() => {
    setChildCount((c) => Math.min(Math.max(0, c), m))
    setTicketServerErr(null)
    setMismatchSeatIds([])
  }, [m, b.seats])
  const adultCount = Math.max(0, m - childCount)

  function adjustChild(nextChild: number) {
    const clamped = Math.min(Math.max(0, nextChild), m)
    setChildCount(clamped)
    setTicketServerErr(null)
    setMismatchSeatIds([])
  }

  if (!mounted) return <Container className="py-16"><p className="text-text-muted">Loading your booking…</p></Container>
  if (!b.showId || !b.seats.length) return (
    <Container className="py-16 text-center">
      <h1 className="font-display text-5xl uppercase">No seats picked yet</h1>
      <ButtonLink to="/now-showing" className="mt-6">Find a film</ButtonLink>
    </Container>
  )
  const seatsUrl = show.data ? `/movie/${show.data.movieId}/seats?show=${encodeURIComponent(show.data.id)}` : '/now-showing'

  const adultPrice = getTicketPriceEur(show.data, 'adult')
  const childPrice = getTicketPriceEur(show.data, 'child')
  const disabledPrice = getTicketPriceEur(show.data, 'disabled')

  // §13.b: every booking needs at least one Adult or Disability ticket
  const isChildOnly = b.seats.length > 0 && adultCount + disabledCount === 0
  const inlineTicketError = isChildOnly
    ? 'Children need an adult or Disability ticket with them [PH]'
    : ticketServerErr

  // Build per-seat tickets payload in hold order: access seats -> 'disabled', first adultCount standard seats -> 'adult', remaining -> 'child'
  const ticketsPayload: TicketSelection[] = (() => {
    let stdIdx = 0
    return b.seats.map((seatId) => {
      if (isAccessSeatId(seatId)) {
        return { seatId, ticketType: 'disabled' as const }
      }
      const ticketType = stdIdx < adultCount ? ('adult' as const) : ('child' as const)
      stdIdx += 1
      return { seatId, ticketType }
    })
  })()

  const totalPrice =
    adultCount * adultPrice +
    childCount * childPrice +
    disabledCount * disabledPrice

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isChildOnly) return
    const f = new FormData(e.currentTarget)
    const input = {
      showId: b.showId!,
      seats: b.seats,
      tickets: ticketsPayload,
      name: String(f.get('name') ?? ''),
      email: String(f.get('email') ?? ''),
      phone: String(f.get('phone') ?? '') || undefined,
    }
    const parsed = BookingInputSchema.safeParse(input)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setErrors({})
    setTicketServerErr(null)
    setMismatchSeatIds([])
    setBusy(true)
    try {
      const res = await createBooking(parsed.data)
      b.setLastRef(res.ref)
      b.clear()
      nav(`/booking/confirmed?ref=${res.ref}`)
    } catch (err) {
      const withPh = (m: string) => {
        const clean = m.replace(/(\s*\[PH\])+\s*$/, "").trimEnd()
        return `${clean} [PH]`
      }
      if (err instanceof ChildOnlyBookingError) {
        setTicketServerErr(withPh(err.message))
      } else if (err instanceof AccessSeatMismatchError) {
        setTicketServerErr(withPh(err.message))
        setMismatchSeatIds(err.seatIds)
      } else {
        toast((err as Error).message)
      }
    } finally { setBusy(false) }
  }

  const field = 'mt-1 w-full min-h-11 rounded-xl bg-surface-2 px-3 ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent'
  return (
    <div className="pb-16">
      <div className="sticky top-16 z-30 border-b border-border bg-bg/90 backdrop-blur">
        <Container className="flex h-12 items-center overflow-x-auto">
          <StepIndicator step={2} />
        </Container>
      </div>
      <Container className="grid gap-6 pt-8 md:grid-cols-[1fr_360px]">
        <form onSubmit={submit} noValidate className="space-y-6">
          {/* §13.b Card 1 — Tickets (top card on /booking, above guest details) */}
          <Card className="p-5" data-testid="tickets-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="font-display text-3xl uppercase tracking-wide">Tickets</h2>
                <p data-testid="tickets-caption" className="mt-1 text-sm text-text-muted">
                  {b.seats.length} {b.seats.length === 1 ? 'seat' : 'seats'} held — adjust ticket types below
                </p>
              </div>
              <span data-testid="tickets-live-summary" className="text-sm text-text-muted tabular-nums">
                {b.seats.length} {b.seats.length === 1 ? 'seat' : 'seats'} · {eur(totalPrice)} [PH]
              </span>
            </div>

            <div className="mt-4 divide-y divide-border">
              {/* Locked Disability rows for held access seats (J1, J2, J15, J16) */}
              {accessSeats.map((s) => {
                const isHighlighted = mismatchSeatIds.includes(s)
                return (
                  <div
                    key={s}
                    data-testid={`ticket-locked-${s}`}
                    aria-label={`Seat ${s} (Wheelchair space) · Disability · ${eur(disabledPrice)} [PH]`}
                    className={cn(
                      'flex min-h-14 items-center justify-between gap-3 py-3 text-sm',
                      isHighlighted && 'rounded-lg bg-danger/10 px-2 ring-1 ring-danger',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-text">
                        Seat {s} · Wheelchair space · Disability · <span className="tabular-nums">{eur(disabledPrice)}</span>{' '}
                        <span className="text-xs text-text-muted">[PH]</span>
                      </p>
                      <p className="text-xs text-text-muted">Wheelchair space locks to a Disability ticket [PH]</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-text-muted ring-1 ring-border">
                      <Lock className="size-3.5" aria-hidden />
                      Locked [PH]
                    </span>
                  </div>
                )
              })}

              {/* Coupled Adult / Child steppers for the remaining m standard seats */}
              {m > 0 && (
                <>
                  <div data-testid="ticket-row-adult" className="flex min-h-14 items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-text">
                        Adult · <span className="tabular-nums">{eur(adultPrice)}</span>{' '}
                        <span className="text-xs text-text-muted">[PH]</span>
                      </p>
                      <p className="text-xs text-text-muted">Standard seat (12+)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="ticket-dec-adult"
                        data-stepper="adult-dec"
                        aria-label="Decrease Adult tickets"
                        disabled={adultCount <= 0}
                        onClick={() => adjustChild(childCount + 1)}
                        className="grid size-11 place-items-center rounded-full bg-surface-2 text-text ring-1 ring-border transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <span
                        data-testid="ticket-count-adult"
                        data-count="adult"
                        aria-live="polite"
                        className="w-6 text-center text-base font-semibold tabular-nums"
                      >
                        {adultCount}
                      </span>
                      <button
                        type="button"
                        data-testid="ticket-inc-adult"
                        data-stepper="adult-inc"
                        aria-label="Increase Adult tickets"
                        disabled={adultCount >= m}
                        onClick={() => adjustChild(childCount - 1)}
                        className="grid size-11 place-items-center rounded-full bg-surface-2 text-text ring-1 ring-border transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <div data-testid="ticket-row-child" className="flex min-h-14 items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-text">
                        Child (under 12) · <span className="tabular-nums">{eur(childPrice)}</span>{' '}
                        <span className="text-xs text-text-muted">[PH]</span>
                      </p>
                      <p className="text-xs text-text-muted">Under 12 years old</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid="ticket-dec-child"
                        data-stepper="child-dec"
                        aria-label="Decrease Child tickets"
                        disabled={childCount <= 0}
                        onClick={() => adjustChild(childCount - 1)}
                        className="grid size-11 place-items-center rounded-full bg-surface-2 text-text ring-1 ring-border transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <span
                        data-testid="ticket-count-child"
                        data-count="child"
                        aria-live="polite"
                        className="w-6 text-center text-base font-semibold tabular-nums"
                      >
                        {childCount}
                      </span>
                      <button
                        type="button"
                        data-testid="ticket-inc-child"
                        data-stepper="child-inc"
                        aria-label="Increase Child tickets"
                        disabled={childCount >= m}
                        onClick={() => adjustChild(childCount + 1)}
                        className="grid size-11 place-items-center rounded-full bg-surface-2 text-text ring-1 ring-border transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {inlineTicketError && (
              <p data-testid="ticket-error" role="alert" className="mt-3 text-sm text-danger">
                {inlineTicketError}
              </p>
            )}
          </Card>

          {/* §13.b Card 2 — Guest details */}
          <div className="space-y-4">
            <h1 className="font-display text-4xl uppercase tracking-wide md:text-5xl">Your details</h1>
            <p className="rounded-xl bg-surface-2 p-3 text-sm text-text-muted">Demo, no payment taken. Nothing is actually booked.</p>
            {(['name', 'email', 'phone'] as const).map((n) => (
              <label key={n} className="block text-sm">
                {n === 'name' ? 'Full name' : n === 'email' ? 'Email' : 'Phone (optional)'}
                <input name={n} type={n === 'email' ? 'email' : n === 'phone' ? 'tel' : 'text'} autoComplete={n === 'name' ? 'name' : n === 'email' ? 'email' : 'tel'} className={field} aria-invalid={!!errors[n]} aria-describedby={errors[n] ? `${n}-err` : undefined} />
                {errors[n] && <span id={`${n}-err`} className="mt-1 block text-danger">{errors[n]}</span>}
              </label>
            ))}
            <Button
              type="submit"
              data-testid="confirm-booking-btn"
              disabled={busy || isChildOnly}
              className="w-full md:w-auto"
            >
              {busy ? 'Confirming…' : `Confirm booking · ${eur(totalPrice)} [PH]`}
            </Button>
          </div>
        </form>

        {/* §13.b Card 3 — Order summary */}
        <Card className="h-fit p-5" data-testid="order-summary-card">
          {b.holdUntil && <HoldTimer until={b.holdUntil} onExpire={() => { toast('Your seat hold expired, seats released'); b.clear(); nav(seatsUrl) }} />}
          <h2 className="mt-4 text-xl">{movie.data?.title ?? '…'} <span className="text-xs text-text-muted">[PH]</span></h2>
          {show.data && <p className="text-sm text-text-muted">{dayLabel(show.data.start)} · {time(show.data.start)} · {show.data.format} · Hall {show.data.hallId.slice(1)} [PH]</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {ticketsPayload.map(({ seatId: s, ticketType }) => {
              const isMismatch = mismatchSeatIds.includes(s)
              const typeLabel = ticketType === 'disabled' ? 'Disability' : ticketType === 'child' ? 'Child' : 'Adult'
              return (
                <span
                  key={s}
                  data-testid={`summary-seat-${s}`}
                  data-seat-chip={s}
                  data-mismatch={isMismatch ? '1' : undefined}
                  className={cn(
                    'rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-fg',
                    isMismatch && 'bg-danger text-white ring-2 ring-danger',
                  )}
                >
                  {s} · {typeLabel}
                </span>
              )
            })}
          </div>
          <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm" data-testid="summary-breakdown">
            {adultCount > 0 && (
              <div className="flex justify-between text-text-muted" data-testid="summary-line-adult">
                <span>{adultCount} × Adult ({eur(adultPrice)})</span>
                <span className="tabular-nums">{eur(adultCount * adultPrice)} [PH]</span>
              </div>
            )}
            {childCount > 0 && (
              <div className="flex justify-between text-text-muted" data-testid="summary-line-child">
                <span>{childCount} × Child ({eur(childPrice)})</span>
                <span className="tabular-nums">{eur(childCount * childPrice)} [PH]</span>
              </div>
            )}
            {disabledCount > 0 && (
              <div className="flex justify-between text-text-muted" data-testid="summary-line-disabled">
                <span>{disabledCount} × Disability ({eur(disabledPrice)})</span>
                <span className="tabular-nums">{eur(disabledCount * disabledPrice)} [PH]</span>
              </div>
            )}
            <div className="flex justify-between pt-2 text-base font-semibold" data-testid="summary-total">
              <span className="text-text-muted">Total</span>
              <span data-testid="summary-total-value" className="font-semibold tabular-nums">{eur(totalPrice)} [PH]</span>
            </div>
          </div>
          <Link to={seatsUrl} onClick={() => { b.releaseHold(); b.setSeats([]) }} className="mt-4 block text-sm text-accent underline">Change seats</Link>
        </Card>
      </Container>
    </div>
  )
}
