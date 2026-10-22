export const eur = (n: number) => `€${n.toFixed(2).replace('.00', '')}`
// fix10: toLocale*String builds a new Intl formatter on every call (~95 ms of boot on 4x CPU across the showtime lists);
// one cached formatter each, created on first use, gives identical output
let tf: Intl.DateTimeFormat | undefined, df: Intl.DateTimeFormat | undefined
export const time = (iso: string) => (tf ??= new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })).format(new Date(iso))
export const dayLabel = (iso: string) => (df ??= new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })).format(new Date(iso))
export const dayKey = (v: Date | string) => { const d = new Date(v); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export function nextDays(n = 7) {
  const out: string[] = []
  const d = new Date(); d.setHours(0, 0, 0, 0)
  for (let i = 0; i < n; i++) { const x = new Date(d); x.setDate(d.getDate() + i); out.push(dayKey(x)) }
  return out
}
export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
