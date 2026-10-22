/** §13 prefetch (no-lag rule): after first paint + requestIdleCallback, add <link rel=prefetch> for the built
 *  HallScene3D chunk (+ its imports) and velvet-tile.webp. Never import()s or runs three.js early.
 *  Chunk URLs come from <meta name="lumen-hall3d" content="url,url"> written at build time from the Vite manifest.
 *  Skipped on data saver, 2g/slow-2g/3g, or when decideThree() isn't 'auto'. */
import { decideThree } from './device'

const KEY = 'lumen.hall3d.prefetched'
let started = false

/** True once the 3D chunk prefetch has loaded (this page or earlier in the session). */
export function isHall3DReady() {
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}

export function prefetchHall3D() {
  if (typeof window === 'undefined' || started) return
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  const et = nav.connection?.effectiveType ?? ''
  if (nav.connection?.saveData || ['slow-2g', '2g', '3g'].includes(et)) return
  if (decideThree().mode !== 'auto') return
  if (new URLSearchParams(location.search).get('noprefetch') === '1') return // measurement A/B only
  const urls = (document.querySelector('meta[name="lumen-hall3d"]')?.getAttribute('content') ?? '').split(',').filter(Boolean)
  if (!urls.length) return // dev server / no manifest
  started = true
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  const go = () => {
    let left = urls.length
    for (const href of urls) {
      const l = document.createElement('link'); l.rel = 'prefetch'; l.href = href; l.as = 'script'; l.crossOrigin = ''
      l.onload = () => { if (--left === 0) try { sessionStorage.setItem(KEY, '1') } catch { /* private mode */ } }
      document.head.appendChild(l)
    }
    // fix8 §15: hall lightmap atlas + velvet normal map ride the same prefetch (never preloaded in HTML)
    for (const href of ['/velvet-tile.webp', '/hall/hall-light.webp', '/hall/velvet-normal.webp']) {
      const img = document.createElement('link'); img.rel = 'prefetch'; img.as = 'image'; img.href = href
      document.head.appendChild(img)
    }
  }
  // fix10: start only after LCP has painted (r9: the idle prefetch began 20-70 ms before the synopsis LCP and split movie LCP
  // 2.4/3.8 s). Wait ~1 s after the latest LCP entry, then idle. Fallback (no LCP observer support): load event + idle.
  const idle = () => (w.requestIdleCallback ? w.requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 200))
  let fired = false, t: ReturnType<typeof setTimeout> | undefined
  const fire = () => { if (fired) return; fired = true; po?.disconnect(); performance.mark('lumen:prefetch3d-start'); idle() }
  let po: PerformanceObserver | undefined
  if (PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) {
    po = new PerformanceObserver(() => { clearTimeout(t); t = setTimeout(fire, 1000) })
    po.observe({ type: 'largest-contentful-paint', buffered: true })
    // LCP stops reporting on input; if nothing new arrives the 1 s timer above still fires. Hard cap for safety:
    setTimeout(() => { if (!t) fire() }, 6000)
  } else if (document.readyState === 'complete') fire()
  else addEventListener('load', fire, { once: true })
}
