export type ThreeDecision = { mode: 'auto' | 'on-demand' | 'off'; reason?: string }

let webgl: boolean | null = null
export function cachedWebGL(): boolean | null {
  if (webgl !== null) return webgl
  if (typeof window === 'undefined') return false
  try {
    const cached = sessionStorage.getItem('lumen.webgl')
    if (cached === '1' || cached === '0') return (webgl = cached === '1')
  } catch { /* storage blocked */ }
  return null
}

export function hasWebGL(): boolean {
  const c0 = cachedWebGL()
  if (c0 !== null) return c0
  if (typeof window === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    webgl = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    try { sessionStorage.setItem('lumen.webgl', webgl ? '1' : '0') } catch { /* ignore */ }
  } catch { webgl = false }
  return webgl
}

export function decideThree(opts?: { deferProbe?: boolean }): ThreeDecision {
  if (typeof window === 'undefined') return { mode: 'off', reason: 'SSR' }
  const q = new URLSearchParams(window.location.search)
  if (q.get('3d') === '1') return { mode: 'auto', reason: 'forced by ?3d=1' }
  if (q.get('2d') === '1' || q.get('simple') === '1' || localStorage.getItem('lumen.simple') === '1') return { mode: 'off', reason: 'Simple view is on' }
  const cached = cachedWebGL()
  if (cached === false) return { mode: 'off', reason: 'Your browser has 3D turned off' }
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  if (nav.connection?.saveData) return { mode: 'off', reason: 'Data saver is on' }
  if ((nav.hardwareConcurrency ?? 8) <= 2) return { mode: 'off', reason: 'Simple view for this device' }
  const mobile = window.matchMedia('(max-width: 1023px)').matches
  if (mobile && (nav.deviceMemory ?? 8) <= 4) return { mode: 'on-demand' }
  if (!opts?.deferProbe && !hasWebGL()) return { mode: 'off', reason: 'Your browser has 3D turned off' }
  return { mode: 'auto' }
}

export function isPhone(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}
