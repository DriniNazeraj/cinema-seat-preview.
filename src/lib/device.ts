/** Decide whether the 3D hall should run, and whether it should auto-start. */
export type ThreeMode = 'auto' | 'on-demand' | 'off'
export type ThreeDecision = { mode: ThreeMode; reason?: string }

/** fix15.3: creating a probe WebGL context costs 100-300 ms on slow/software GPUs (SEO r151: prefetch3d chunk 176-379 ms at 4x).
 *  Probe once per session (cached in memory + sessionStorage) and release the probe context straight away. */
let webgl: boolean | undefined
export function hasWebGL(): boolean {
  if (webgl !== undefined) return webgl
  try { const v = sessionStorage.getItem('lumen.webgl'); if (v) return (webgl = v === '1') } catch { /* private mode */ }
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    webgl = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { webgl = false }
  try { sessionStorage.setItem('lumen.webgl', webgl ? '1' : '0') } catch { /* private mode */ }
  return webgl
}

export function decideThree(): ThreeDecision {
  if (typeof window === 'undefined') return { mode: 'off', reason: 'ssr' }
  const q = new URLSearchParams(location.search)
  // ?3d=1 forces the 3D path (skips GPU/data-saver/memory checks), e.g. to measure the three chunk on software WebGL.
  if (q.get('3d') === '1') return { mode: 'auto', reason: 'forced by ?3d=1' }
  if (q.get('simple') === '1' || localStorage.getItem('lumen.simple') === '1') return { mode: 'off', reason: 'Simple view is on' }
  if (!hasWebGL()) return { mode: 'off', reason: 'Your browser has 3D turned off' }
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number }
  if (nav.connection?.saveData) return { mode: 'off', reason: 'Data saver is on' }
  if ((nav.hardwareConcurrency ?? 8) <= 2) return { mode: 'off', reason: 'Simple view for this device' }
  const mobile = window.matchMedia('(max-width: 1023px)').matches
  if (mobile && (nav.deviceMemory ?? 8) <= 4) return { mode: 'on-demand' }
  return { mode: 'auto' }
}

export function isPhone() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
}
