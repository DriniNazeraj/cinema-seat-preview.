import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleCheck, CalendarPlus } from 'lucide-react'
import { getBooking, getMovie, getSeatMap, type Booking } from '@/lib/api'
import { useBooking } from '@/lib/booking'
import { dayLabel, time } from '@/lib/format'
import { Button, ButtonLink, Card, Container } from '@/components/ui'
import { SeatMap2D } from '@/components/SeatMap2D'
import { StepIndicator } from '@/components/Shows'
import type { Movie, SeatMap } from '@/lib/api'

export default function Confirmed() {
  const [q] = useSearchParams()
  const { lastRef } = useBooking()
  const [data, setData] = useState<{ b: Booking; map: SeatMap; movie: Movie | null } | null | undefined>(undefined)
  useEffect(() => {
    const ref = q.get('ref') ?? lastRef
    if (!ref) { setData(null); return }
    getBooking(ref).then(async (b) => {
      if (!b) return setData(null)
      const map = await getSeatMap(b.showId)
      setData({ b, map, movie: await getMovie(map.show.movieId) })
    })
  }, [q, lastRef])
  const taken = useMemo(() => new Set(data?.map.taken ?? []), [data])

  function ics() {
    if (!data) return
    const s = new Date(data.map.show.start)
    const e = new Date(s.getTime() + (data.movie?.runtime ?? 120) * 60000)
    const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lumen Cinema PH//EN', 'BEGIN:VEVENT', `UID:${data.b.ref}@lumen.example`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(s)}`, `DTEND:${f(e)}`,
      `SUMMARY:${data.movie?.title ?? 'Film'} [PH] at Lumen Cinema [PH]`, `DESCRIPTION:Seats ${data.b.seats.join(' ')} · ref ${data.b.ref} (demo)`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }))
    a.download = `lumen-${data.b.ref}.ics`
    a.click()
  }

  return (
    <div className="pb-16">
      <div className="sticky top-16 z-30 border-b border-border bg-bg/90 backdrop-blur"><Container className="flex h-12 items-center overflow-x-auto"><StepIndicator step={3} /></Container></div>
      <Container className="max-w-2xl pt-10 text-center">
        <CircleCheck className="mx-auto size-16 text-success" aria-hidden />
        <h1 className="mt-4 font-display text-5xl uppercase tracking-wide">Booking confirmed</h1>
        {data === undefined ? <p className="text-text-muted">Loading…</p> : data === null ? (
          <p className="mt-2 text-text-muted">We couldn't find that booking (demo bookings only live in this browser tab).</p>
        ) : (
          <>
            <p className="mt-2 text-text-muted">Ref <span className="font-semibold text-text">{data.b.ref}</span> [PH] · {data.movie?.title} · {dayLabel(data.map.show.start)} {time(data.map.show.start)}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">{data.b.seats.map((s) => <span key={s} className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-fg">{s}</span>)}</div>
            <Card className="mt-6 p-4"><SeatMap2D hall={data.map.hall} taken={new Set([...taken].filter((t) => !data.b.seats.includes(t)))} selected={data.b.seats} price={data.map.show.price} onPick={() => {}} readOnly compact /></Card>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="ghost" onClick={ics}><CalendarPlus className="size-4" /> Add to calendar</Button>
              <ButtonLink to="/">Back to home</ButtonLink>
            </div>
          </>
        )}
      </Container>
    </div>
  )
}
