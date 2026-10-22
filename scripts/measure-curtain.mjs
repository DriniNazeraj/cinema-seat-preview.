// fix6: loading-screen timing, median of 3 (software WebGL). Needs serve:prod on 4175.
// load->curtain start = lumen:curtain-open mark; slide = curtain-open -> curtain-gone; plus long-task ms during the slide.
import { chromium } from 'playwright'
const URL = 'http://localhost:4175/movie/starlight-run/seats?3d=1' + (process.argv[2] ? '&' + process.argv[2] : '')
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const vps = { desktop: { viewport: { width: 1440, height: 900 } }, mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]
const out = {}
for (const [name, opt] of Object.entries(vps)) {
  const runs = []
  for (let i = 0; i < 3; i++) {
    const c = await b.newContext(opt); const p = await c.newPage()
    await p.addInitScript(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }) })
    if (name === 'mobile') { const s = await c.newCDPSession(p); await s.send('Emulation.setCPUThrottlingRate', { rate: 4 }) }
    await p.goto(URL); await p.waitForSelector('[role="dialog"] [data-seat]', { timeout: 30000 }); await p.waitForTimeout(300)
    const r = await p.evaluate(() => {
      const m = Object.fromEntries(performance.getEntriesByType('mark').filter((x) => x.name.startsWith('lumen:')).map((x) => [x.name.slice(6), x.startTime]))
      const o = m['curtain-open'], g = m['curtain-gone']
      const lt = window.__lt.filter(([s]) => s >= o && s <= g).reduce((a, [, d]) => a + d, 0)
      return { start: Math.round(o), slide: Math.round(g - o), longTaskMsInSlide: Math.round(lt), hallReady: Math.round(m['hall-ready'] ?? -1), hallShown: Math.round(m['hall-shown'] ?? -1) }
    })
    runs.push(r); await c.close()
  }
  out[name] = { runs, median: { start: med(runs.map((r) => r.start)), slide: med(runs.map((r) => r.slide)), longTaskMsInSlide: med(runs.map((r) => r.longTaskMsInSlide)) } }
}
console.log(JSON.stringify(out, null, 1)); await b.close()
