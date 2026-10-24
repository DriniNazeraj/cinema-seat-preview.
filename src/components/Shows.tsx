import { Link, useNavigate } from 'react-router-dom'
import type { Movie, Show } from '@/lib/api'
import { cn, dayLabel, eur, time } from '@/lib/format'
import { Poster } from './Poster'

export function seatsUrl(s: Show) { return `/movie/${s.movieId}/seats?show=${encodeURIComponent(s.id)}` }

export function ShowtimePill({ show, withPrice = false, onSelect, expanded, controls }: { show: Show; withPrice?: boolean; onSelect?: (s: Show) => void; expanded?: boolean; controls?: string }) {
  const nav = useNavigate()
  return (
    <button
      type="button"
      data-show={show.id}
      disabled={show.soldOut}
      aria-expanded={onSelect ? !!expanded : undefined}
      aria-controls={onSelect && expanded ? controls : undefined}
      onClick={() => (onSelect ? onSelect(show) : nav(seatsUrl(show)))}
      className={cn('inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm tabular-nums ring-1 ring-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        show.soldOut ? 'cursor-not-allowed text-text-muted line-through opacity-60' : expanded ? 'bg-accent text-accent-fg' : 'bg-surface-2 hover:bg-accent hover:text-accent-fg')}
    >
      <span className="font-medium">{time(show.start)}</span>
      {withPrice && <span className="text-xs opacity-80">{show.soldOut ? 'Sold out' : eur(show.price)}</span>}
      <span className="sr-only">{` ${show.format}${show.soldOut && !withPrice ? ', sold out' : ''}`}</span>
    </button>
  )
}

export function DateChips({ days, value, onChange, className }: { days: string[]; value: string; onChange: (d: string) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Choose a date" className={cn('flex snap-x gap-2 overflow-x-auto pb-1', className)}>
      {days.map((d, i) => (
        <button key={d} role="radio" aria-checked={d === value} onClick={() => onChange(d)}
          className={cn('min-h-11 shrink-0 snap-start rounded-full px-4 text-sm ring-1 ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            d === value ? 'bg-accent text-accent-fg' : 'bg-surface hover:bg-surface-2')}>
          {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayLabel(d + 'T12:00:00')}
        </button>
      ))}
    </div>
  )
}

export function PosterCard({ movie, shows }: { movie: Movie; shows?: Show[] }) {
  return (
    <article className="group">
      <Link to={`/movie/${movie.id}`} className="block overflow-hidden rounded-xl ring-1 ring-border transition group-hover:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <div className="aspect-[2/3] transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"><Poster movie={movie} /></div>
      </Link>
      <h3 className="mt-3 text-xl"><Link to={`/movie/${movie.id}`} className="hover:text-accent">{movie.title} <span className="text-xs text-text-muted">[PH]</span></Link></h3>
      <p className="text-sm text-text-muted">{movie.runtime} min · {movie.rating}</p>
      {shows && <div className="mt-2 flex flex-wrap gap-2">{shows.filter((s) => !s.soldOut).slice(0, 3).map((s) => <ShowtimePill key={s.id} show={s} />)}</div>}
    </article>
  )
}

export function StepIndicator({ step }: { step: 0 | 1 | 2 | 3 }) {
  const steps = ['Showtime', 'Seats', 'Details', 'Done']
  return (
    <ol className="flex items-center gap-2 text-xs md:text-sm" aria-label="Booking steps">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
          <span className={cn('grid size-6 place-items-center rounded-full text-[11px] font-semibold', i < step ? 'bg-success text-bg' : i === step ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-text-muted')}>{i + 1}</span>
          <span className={i === step ? 'text-text' : 'sr-only text-text-muted sm:not-sr-only'}>{s}</span>
          {i < steps.length - 1 && <span className="h-px w-3 bg-border sm:w-4 md:w-8" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}
