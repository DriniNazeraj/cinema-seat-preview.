export const eur = (n: number) => `€${n.toFixed(2).replace('.00', '')}`
export const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
export const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
export const dayKey = (v: Date | string) => { const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export function nextDays(n = 7) {
  const out: string[] = []
  const d = new Date(); d.setHours(0, 0, 0, 0)
  for (let i = 0; i < n; i++) { const x = new Date(d); x.setDate(d.getDate() + i); out.push(dayKey(x)) }
  return out
}
export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
