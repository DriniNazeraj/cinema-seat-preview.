/** Decide whether the 3D hall should run, and whether it should auto-start. */
export type ThreeMode = 'auto' | 'on-demand' | 'off'
export type ThreeDecision = { mode: ThreeMode; reason?: string }

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

export function decideThree(): ThreeDecision {
  if (typeof window === 'undefined') return { mode: 'off', reason: 'ssr' }
  const q = new URLSearchParams(location.search)
  if (q.get('simple') === '1' || localStorage.getItem('lumen.simple') === '1') return { mode: 'off', reason: 'Simple view is on' }
  if (!hasWebGL()) return { mode: 'off', reason: 'Your browser has 3D turned off' }
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  if (nav.connection?.saveData) return { mode: 'off', reason: 'Data saver is on' }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { mode: 'off', reason: 'Reduced motion is on' }
  if ((nav.hardwareConcurrency ?? 8) <= 2) return { mode: 'off', reason: 'Simple view for this device' }
  const mobile = window.matchMedia('(max-width: 1023px)').matches
  if (mobile && (nav.deviceMemory ?? 8) <= 4) return { mode: 'on-demand' }
  return { mode: 'auto' }
}

export function isPhone() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}
