import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Armchair } from 'lucide-react'
import { listMovies, listShows } from '@/lib/api'
import { useData } from '@/lib/useData'
import { nextDays, dayKey } from '@/lib/format'
import { ButtonLink, Container, ErrorCard, Skeleton, PH } from '@/components/ui'
import { Poster } from '@/components/Poster'
import { DateChips, PosterCard, ShowtimePill } from '@/components/Shows'
import { ViewFromSeatCard } from '@/components/ViewFromSeatCard'

export default function Home() {
  const movies = useData('movies', listMovies)
  const shows = useData('shows:all', () => listShows())
  const days = useMemo(() => nextDays(7), [])
  const [day, setDay] = useState(days[0])
  const featured = movies.data?.[0]
  const todays = (shows.data ?? []).filter((s) => dayKey(s.start) === day)

  return (
    <>
      <section className="relative flex min-h-[80svh] md:min-h-[70svh] items-end overflow-hidden">
        <div className="absolute inset-0">{featured && <Poster movie={featured} wide />}</div>
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
        <Container className="relative pb-16 md:pb-24">
          {featured ? (
            <>
              <p className="mb-2 text-sm uppercase tracking-widest text-accent">Featured <PH /></p>
              <h1 className="font-display text-5xl uppercase tracking-wide md:text-7xl">{featured.title} <PH /></h1>
              <p className="mt-2 max-w-xl text-lg text-text/90">{featured.tagline}</p>
              <p className="mt-2 text-sm text-text-muted">{featured.rating} · {featured.runtime} min · {featured.genres.join(', ')}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink to={`/movie/${featured.id}`}>Get tickets</ButtonLink>
                <ButtonLink to={`/movie/${featured.id}#trailer`} variant="ghost"><Play className="size-4" /> Trailer</ButtonLink>
              </div>
            </>
          ) : <Skeleton className="h-40 w-2/3" />}
        </Container>
      </section>

      <section className="pb-16 pt-16 md:pb-24 md:pt-12" aria-labelledby="now">
        <Container>
          <div className="mb-6 flex items-end justify-between">
            <h2 id="now" className="font-display text-3xl uppercase tracking-wide md:text-4xl">Now showing</h2>
            <Link to="/now-showing" className="text-sm text-accent hover:underline">See all</Link>
          </div>
          {movies.error ? <ErrorCard onRetry={movies.retry} /> : (
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible md:px-0">
              {(movies.data ?? Array(4).fill(null)).slice(0, 4).map((m, i) => (
                <div key={m?.id ?? i} className="w-44 shrink-0 snap-start md:w-auto">{m ? <PosterCard movie={m} /> : <Skeleton className="aspect-[2/3]" />}</div>
              ))}
            </div>
          )}
        </Container>
      </section>

      <section className="border-y border-border bg-surface py-16 md:py-24">
        <Container className="grid items-center gap-8 md:grid-cols-2">
          <div className="aspect-video overflow-hidden rounded-xl ring-1 ring-border"><ViewFromSeatCard seat={null} hall={{ id: 'x', name: '', columns: 18, rows: [] }} /></div>
          <div>
            <Armchair className="mb-4 size-8 text-accent" aria-hidden />
            <h2 className="font-display text-3xl uppercase tracking-wide md:text-4xl">Pick your seat before you buy</h2>
            <p className="mt-3 text-text-muted">Tap any seat and see the screen from right there, in 3D. No more guessing if row C is too close.</p>
            <ButtonLink to="/now-showing" className="mt-6">Try it</ButtonLink>
          </div>
        </Container>
      </section>

      <section className="py-16 md:py-24" aria-labelledby="today">
        <Container>
          <h2 id="today" className="mb-6 font-display text-3xl uppercase tracking-wide md:text-4xl">Showtimes</h2>
          <DateChips days={days} value={day} onChange={setDay} className="mb-6" />
          <ul className="divide-y divide-border rounded-xl bg-surface ring-1 ring-border">
            {(movies.data ?? []).map((m) => {
              const list = todays.filter((s) => s.movieId === m.id)
              if (!list.length) return null
              return (
                <li key={m.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <Link to={`/movie/${m.id}`} className="text-lg hover:text-accent">{m.title} <span className="text-sm text-text-muted">· {m.runtime} min</span></Link>
                  <div className="flex flex-wrap gap-2">{list.map((s) => <ShowtimePill key={s.id} show={s} />)}</div>
                </li>
              )
            })}
            {shows.data && !todays.length && <li className="p-6 text-text-muted">No shows on this day.</li>}
          </ul>
        </Container>
      </section>
    </>
  )
}
