import { useEffect, useState } from 'react'
import { prefetchHall3D } from '@/lib/prefetch3d'
import { useParams } from 'react-router-dom'
import { Play } from 'lucide-react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/Dialog'
import { getMovie, listShows, type Show } from '@/lib/api'
import { useData } from '@/lib/useData'
import { dayKey, dayLabel } from '@/lib/format'
import { Button, Container, ErrorCard, PH, Skeleton } from '@/components/ui'
import { Poster } from '@/components/Poster'
import { ShowtimePill } from '@/components/Shows'
import { PARTY_STEP_ID, PartySizeStep, useIsDesktop } from '@/components/PartySizeStep'

export default function MoviePage() {
  const { id = '' } = useParams()
  const movie = useData(`movie:${id}`, () => getMovie(id))
  const shows = useData(`shows:${id}`, () => listShows({ movieId: id }))
  const [trailer, setTrailer] = useState(false)
  const [picked, setPicked] = useState<Show | null>(null) // fix16 §15.t: showtime -> "How many seats?" step
  const desktop = useIsDesktop()
  // §13 prefetch: warm the 3D chunk + velvet tile while the visitor picks a showtime (link prefetch only)
  useEffect(() => { prefetchHall3D() }, [])
  useEffect(() => { if (typeof location !== 'undefined' && location.hash === '#trailer') setTrailer(true) }, [])

  if (movie.error) return <Container className="py-16"><ErrorCard onRetry={movie.retry} /></Container>
  if (movie.loading && !movie.data) return <Container className="py-16"><Skeleton className="h-96" /></Container>
  const m = movie.data
  if (!m) return <Container className="py-16"><h1 className="font-display text-5xl">Film not found</h1></Container>

  const byDay = new Map<string, Map<string, Show[]>>()
  for (const s of shows.data ?? []) {
    const d = dayKey(s.start)
    if (!byDay.has(d)) byDay.set(d, new Map())
    const f = byDay.get(d)!
    f.set(s.format, [...(f.get(s.format) ?? []), s])
  }

  return (
    <>
      <div className="relative h-56 overflow-hidden md:h-80">
        <Poster movie={m} wide />
        <div className="absolute inset-0 bg-gradient-to-t from-bg to-transparent" />
      </div>
      <Container className="relative -mt-32 grid gap-8 pb-16 md:-mt-40 md:grid-cols-[240px_1fr]">
        <div className="mx-auto w-40 overflow-hidden rounded-xl ring-1 ring-border md:w-full"><div className="aspect-[2/3]"><Poster movie={m} /></div></div>
        <div className="md:pt-24">
          <h1 className="font-display text-5xl uppercase tracking-wide md:text-7xl">{m.title} <PH /></h1>
          <p className="mt-1 text-sm text-text-muted">{m.rating} · {m.runtime} min · {m.genres.join(', ')}</p>
          <p className="mt-4 max-w-2xl text-text/90">{m.synopsis}</p>
          <Dialog open={trailer} onOpenChange={setTrailer}>
            <DialogTrigger asChild><Button variant="ghost" className="mt-5"><Play className="size-4" /> Watch trailer</Button></DialogTrigger>
            <DialogContent title={`${m.title} trailer`} closeLabel="Close trailer">
              <div className="relative aspect-video w-full">
                <Poster movie={m} wide />
                <p className="absolute inset-0 grid place-items-center font-display text-4xl">TRAILER [PH]</p>
              </div>
            </DialogContent>
          </Dialog>

          <h2 className="mt-10 font-display text-3xl uppercase tracking-wide">Showtimes</h2>
          <div className="mt-4 space-y-6">
            {[...byDay.entries()].map(([d, formats]) => (
              <section key={d} aria-label={dayLabel(d + 'T12:00:00')}>
                <h3 className="mb-2 text-xl">{dayLabel(d + 'T12:00:00')}</h3>
                {[...formats.entries()].map(([f, list]) => (
                  <div key={f}>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="w-14 rounded-full bg-surface-2 px-2 py-1 text-center text-xs font-semibold">{f}{f === 'IMAX' && ' [PH]'}</span>
                      {list.map((s) => <ShowtimePill key={s.id} show={s} withPrice expanded={picked?.id === s.id} controls={PARTY_STEP_ID}
                        onSelect={(x) => setPicked((p) => (p?.id === x.id && desktop ? null : x))} />)}
                    </div>
                    {picked && list.some((s) => s.id === picked.id) && <PartySizeStep key={picked.id} show={picked} desktop={desktop} onClose={() => setPicked(null)} />}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </Container>
    </>
  )
}
