/** fix16 §15.t: "How many seats?" between the showtime and the picker. Phone: bottom Sheet (Radix: focus trap, Esc). Desktop: inline Card. */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { Show } from '@/lib/api'
import { dayLabel, time } from '@/lib/format'
import { Button, Card } from './ui'
import { PartyStepper } from './PartyStepper'
import { seatsUrl } from './Shows'

export const PARTY_STEP_ID = 'party-step'

export function useIsDesktop() {
  const q = '(min-width: 768px)'
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q); const on = () => setM(mq.matches)
    on(); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

function Body({ show, party, setParty, titleId }: { show: Show; party: number; setParty: (n: number) => void; titleId?: string }) {
  const nav = useNavigate()
  return (
    <>
      <h4 id={titleId} className="font-display text-2xl uppercase tracking-wide">How many seats? [PH]</h4>
      <p className="mt-0.5 text-sm text-text-muted">{dayLabel(show.start)} · {time(show.start)} · {show.format}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <PartyStepper value={party} onChange={setParty} />
        <Button data-choose-seats className="min-h-11" onClick={() => nav(`${seatsUrl(show)}&party=${party}`)}>Choose seats →</Button>
      </div>
    </>
  )
}

export function PartySizeStep({ show, desktop, onClose }: { show: Show; desktop: boolean; onClose: () => void }) {
  const [party, setParty] = useState(2)
  if (desktop) return (
    <Card className="mt-2 mb-3 max-w-xl p-4 md:p-5"><section id={PARTY_STEP_ID} data-party-step aria-labelledby="party-step-title"><Body show={show} party={party} setParty={setParty} titleId="party-step-title" /></section></Card>
  )
  return (
    <D.Root open onOpenChange={(o) => { if (!o) onClose() }}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <D.Content id={PARTY_STEP_ID} data-party-step aria-describedby={undefined}
          onCloseAutoFocus={(e) => { e.preventDefault(); document.querySelector<HTMLElement>(`[data-show="${CSS.escape(show.id)}"]`)?.focus() }}
          className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ring-1 ring-border focus:outline-none motion-safe:animate-sheet-up">
          <D.Title asChild><span className="sr-only">How many seats?</span></D.Title>
          <div className="absolute right-3 top-3"><D.Close aria-label="Close" className="grid size-11 place-items-center rounded-full bg-bg/80 ring-1 ring-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><X className="size-5" aria-hidden /></D.Close></div>
          <Body show={show} party={party} setParty={setParty} />
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
