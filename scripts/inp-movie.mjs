// fix5: INP proxy on /movie/starlight-run with vs without the idle 3D prefetch (390px, 4x CPU). Opens/closes the trailer dialog
// during the prefetch window; reports worst event duration (Event Timing API) per run.
import { chromium } from 'playwright'
const b = await chromium.launch()
const out = {}
for (const mode of ['prefetch', 'noprefetch']) {
  out[mode] = []
  for (let i = 0; i < 3; i++) {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await c.newPage()
    const s = await c.newCDPSession(p); await s.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await p.addInitScript(() => { window.__ev = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__ev.push(e.duration))).observe({ type: 'event', durationThreshold: 16, buffered: true }) })
    await p.goto('http://localhost:4175/movie/starlight-run' + (mode === 'noprefetch' ? '?noprefetch=1' : ''))
    // open/close the trailer dialog 4x starting right after load (covers the idle prefetch window)
    const btn = p.getByRole('button', { name: /Watch trailer/ }); await btn.waitFor()
    for (let k = 0; k < 4; k++) { await btn.tap(); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(300) }
    await p.waitForTimeout(500)
    const ev = await p.evaluate(() => window.__ev); out[mode].push(Math.round(Math.max(0, ...ev))); await c.close()
  }
}
console.log('INP', JSON.stringify(out)); await b.close()
