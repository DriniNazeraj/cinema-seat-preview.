/** fix16 §15.t: 1–8 seat stepper. Labelled group "Number of seats", value announced on change, 44px buttons, arrow keys step. */
import { useId, type KeyboardEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { MAX_SEATS } from '@/lib/api'
import { cn } from '@/lib/format'

export function PartyStepper({ value, onChange, className }: { value: number; onChange: (n: number) => void; className?: string }) {
  const id = useId()
  const set = (n: number) => onChange(Math.min(MAX_SEATS, Math.max(1, n)))
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(value + 1) }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(value - 1) }
    else if (e.key === 'Home') { e.preventDefault(); set(1) }
    else if (e.key === 'End') { e.preventDefault(); set(MAX_SEATS) }
  }
  const btn = 'grid size-11 place-items-center rounded-full bg-surface-2 ring-1 ring-border hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div role="group" aria-labelledby={id} data-party-stepper onKeyDown={onKey} className={cn('flex items-center gap-4', className)}>
      <span id={id} className="sr-only">Number of seats</span>
      <button type="button" className={btn} aria-label="Fewer seats" disabled={value <= 1} onClick={() => set(value - 1)}><Minus className="size-5" aria-hidden /></button>
      <output data-party-value aria-live="polite" aria-atomic="true" className="min-w-16 text-center text-3xl font-semibold tabular-nums">
        {value}<span className="sr-only">{value === 1 ? ' seat' : ' seats'}</span>
      </output>
      <button type="button" className={btn} aria-label="More seats" disabled={value >= MAX_SEATS} onClick={() => set(value + 1)}><Plus className="size-5" aria-hidden /></button>
    </div>
  )
}
