/** §10/§11/§12 curtain loader: full-viewport velvet halves (z-50). Only transform (or opacity when reduced motion) animates. */
import React, { useEffect, useRef, useState } from 'react'
import { cn, prefersReducedMotion } from '@/lib/format'

export type CurtainPhase = 'closed' | 'opening' | 'gone'

export function Curtains({ phase, progress, onGone, hideLine }: { phase: CurtainPhase; progress: number; onGone: () => void; hideLine?: boolean }) {
  const reduce = prefersReducedMotion()
  const [moving, setMoving] = useState(false)
  const fired = useRef(false)
  const done = () => { if (!fired.current) { fired.current = true; onGone() } }
  useEffect(() => {
    if (phase !== 'opening') return
    const a = setTimeout(() => setMoving(true), 120) // line holds at 100% for 120ms
    // fix6: transitionend on the left half (transform, or opacity under reduced motion) normally ends it. The backstop is now
    // the designed duration + 150ms (was +1500ms, which QA saw closing every run), and no transition at all -> done at once.
    const b = setTimeout(done, 120 + (reduce ? 300 : 900) + 150)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!moving || !left.current) return
    const d = getComputedStyle(left.current).transitionDuration.split(',').map(parseFloat)
    if (!d.some((x) => x > 0)) done()
  }, [moving]) // eslint-disable-line react-hooks/exhaustive-deps
  const left = useRef<HTMLDivElement>(null)
  const onEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (!moving || e.target !== e.currentTarget) return
    if (e.propertyName === (reduce ? 'opacity' : 'transform')) { performance.mark('lumen:curtain-transitionend'); done() }
  }
  if (phase === 'gone') return null
  const half = 'curtain velvet-tex absolute top-0 h-full w-[50.5%] shadow-[inset_-24px_0_32px_-16px_rgba(0,0,0,.55)]'
  const open = (dir: string) => (moving ? (reduce ? 'opacity-0' : dir) : '')
  return (
    <div aria-hidden data-curtains={moving ? 'opening' : 'closed'} className={cn('fixed inset-0 z-50 overflow-hidden', phase === 'opening' && 'pointer-events-none')}>
      <div className={cn(half, 'left-0', open('-translate-x-full'))} ref={left} onTransitionEnd={onEnd} />
      <div className={cn(half, 'right-0 -scale-x-100', open('translate-x-full'))} />
      <div className={cn('curtain velvet-tex absolute inset-x-0 top-0 h-[6%] border-b border-[#F2B544]/40 shadow-[0_8px_16px_rgba(0,0,0,.6)]', moving && (reduce ? 'opacity-0' : '-translate-y-full'))} />
      <div className={cn('absolute inset-x-0 bottom-0 h-0.5 transition-opacity duration-200', (phase === 'opening' || hideLine) && 'opacity-0')}>
        <div className="h-full bg-[#F2B544] shadow-[0_0_8px_#F2B544] transition-[width] ease-out" style={{ width: `${progress}%`, transitionDuration: progress >= 100 ? '120ms' : '2000ms' }} />
      </div>
    </div>
  )
}
