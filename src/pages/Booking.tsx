import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Timer } from 'lucide-react'
import { BookingInputSchema, createBooking, getMovie, getShow } from '@/lib/api'
import { useBooking } from '@/lib/booking'
import { useData } from '@/lib/useData'
import { dayLabel, eur, time } from '@/lib/format'
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
  useEffect(() => setMounted(true), [])

  if (!mounted) return <Container className="py-16"><p className="text-text-muted">Loading your booking…</p></Container>
  if (!b.showId || !b.seats.length) return (
    <Container className="py-16 text-center">
      <h1 className="font-display text-5xl uppercase">No seats picked yet</h1>
      <ButtonLink to="/now-showing" className="mt-6">Find a film</ButtonLink>
    </Container>
  )
  const seatsUrl = show.data ? `/movie/${show.data.movieId}/seats?show=${encodeURIComponent(show.data.id)}` : '/now-showing'

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const input = { showId: b.showId!, seats: b.seats, name: String(f.get('name') ?? ''), email: String(f.get('email') ?? ''), phone: String(f.get('phone') ?? '') || undefined }
    const parsed = BookingInputSchema.safeParse(input)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])))
      return
    }
    setErrors({}); setBusy(true)
    try {
      const res = await createBooking(parsed.data)
      b.setLastRef(res.ref)
      b.clear()
      nav(`/booking/confirmed?ref=${res.ref}`)
    } catch (err) {
      toast((err as Error).message)
    } finally { setBusy(false) }
  }

  const field = 'mt-1 w-full min-h-11 rounded-xl bg-surface-2 px-3 ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent'
  return (
    <div className="pb-16">
      <div className="sticky top-16 z-30 border-b border-border bg-bg/90 backdrop-blur"><Container className="flex h-12 items-center overflow-x-auto"><StepIndicator step={2} /></Container></div>
      <Container className="grid gap-6 pt-8 md:grid-cols-[1fr_360px]">
        <form onSubmit={submit} noValidate className="space-y-4">
          <h1 className="font-display text-4xl uppercase tracking-wide md:text-5xl">Your details</h1>
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-text-muted">Demo, no payment taken. Nothing is actually booked.</p>
          {(['name', 'email', 'phone'] as const).map((n) => (
            <label key={n} className="block text-sm">
              {n === 'name' ? 'Full name' : n === 'email' ? 'Email' : 'Phone (optional)'}
              <input name={n} type={n === 'email' ? 'email' : n === 'phone' ? 'tel' : 'text'} autoComplete={n === 'name' ? 'name' : n === 'email' ? 'email' : 'tel'} className={field} aria-invalid={!!errors[n]} aria-describedby={errors[n] ? `${n}-err` : undefined} />
              {errors[n] && <span id={`${n}-err`} className="mt-1 block text-danger">{errors[n]}</span>}
            </label>
          ))}
          <Button type="submit" disabled={busy} className="w-full md:w-auto">{busy ? 'Confirming…' : 'Confirm booking (demo)'}</Button>
        </form>
        <Card className="h-fit p-5">
          {b.holdUntil && <HoldTimer until={b.holdUntil} onExpire={() => { toast('Your seat hold expired, seats released'); b.clear(); nav(seatsUrl) }} />}
          <h2 className="mt-4 text-xl">{movie.data?.title ?? '…'} <span className="text-xs text-text-muted">[PH]</span></h2>
          {show.data && <p className="text-sm text-text-muted">{dayLabel(show.data.start)} · {time(show.data.start)} · {show.data.format} · Hall {show.data.hallId.slice(1)} [PH]</p>}
          <div className="mt-3 flex flex-wrap gap-2">{b.seats.map((s) => <span key={s} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-fg">{s}</span>)}</div>
          <div className="mt-4 flex justify-between border-t border-border pt-4"><span className="text-text-muted">{b.seats.length} × {eur(show.data?.price ?? 0)}</span><span className="font-semibold">{eur(b.seats.length * (show.data?.price ?? 0))} [PH]</span></div>
          <Link to={seatsUrl} className="mt-4 block text-sm text-accent underline">Change seats</Link>
        </Card>
      </Container>
    </div>
  )
}
