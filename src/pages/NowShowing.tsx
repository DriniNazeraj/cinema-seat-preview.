import { useMemo, useState } from 'react'
import { listMovies, listShows } from '@/lib/api'
import { useData } from '@/lib/useData'
import { cn, dayKey, nextDays } from '@/lib/format'
import { Button, Container, ErrorCard, Skeleton } from '@/components/ui'
import { DateChips, PosterCard } from '@/components/Shows'

export default function NowShowing() {
  const movies = useData('movies', listMovies)
  const shows = useData('shows:all', () => listShows())
  const days = useMemo(() => nextDays(7), [])
  const [day, setDay] = useState(days[0])
  const [genre, setGenre] = useState<string | null>(null)
  const genres = [...new Set((movies.data ?? []).flatMap((m) => m.genres))]
  const dayShows = (shows.data ?? []).filter((s) => dayKey(s.start) === day)
  const list = (movies.data ?? []).filter((m) => (!genre || m.genres.includes(genre)) && dayShows.some((s) => s.movieId === m.id))
  const nextDay = days.find((d) => d > day && (shows.data ?? []).some((s) => dayKey(s.start) === d))

  return (
    <Container className="py-10 md:py-16">
      <h1 className="mb-6 font-display text-5xl uppercase tracking-wide md:text-7xl">Now showing</h1>
      <div className="sticky top-16 z-30 -mx-4 space-y-3 bg-bg/90 px-4 py-3 backdrop-blur">
        <DateChips days={days} value={day} onChange={setDay} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by genre">
          {[null, ...genres].map((g) => (
            <button key={g ?? 'all'} aria-pressed={genre === g} onClick={() => setGenre(g)}
              className={cn('min-h-9 rounded-full px-3 text-xs ring-1 ring-border', genre === g ? 'bg-text text-bg' : 'text-text-muted hover:text-text')}>{g ?? 'All'}</button>
          ))}
        </div>
      </div>
      {movies.error ? <ErrorCard onRetry={movies.retry} /> : !movies.data ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[2/3]" />)}</div>
      ) : list.length ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {list.map((m) => <PosterCard key={m.id} movie={m} shows={dayShows.filter((s) => s.movieId === m.id)} />)}
        </div>
      ) : (
        <div className="mt-10 rounded-xl bg-surface p-8 text-center ring-1 ring-border">
          <p className="mb-4 text-text-muted">No shows on this day.</p>
          {nextDay && <Button onClick={() => setDay(nextDay)}>Show next available date</Button>}
        </div>
      )}
    </Container>
  )
}
