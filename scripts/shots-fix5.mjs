// fix5: flow screenshots + loading-screen timing (software WebGL). Needs npm run serve:prod on 4175.
import { chromium } from 'playwright'
const BASE = 'http://localhost:4175', OUT = '/workspace/cinema/final/flow-shots'
const URL = BASE + '/movie/starlight-run/seats?3d=1'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const vps = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }
const marks = (p) => p.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('lumen:')).map((m) => [m.name.slice(6), Math.round(m.startTime)])))
const timing = {}
for (const [name, vp] of Object.entries(vps)) {
  const { width, height, ...rest } = vp
  // screenshots
  { const c = await b.newContext({ viewport: { width, height }, ...rest }); const p = await c.newPage()
    await p.goto(URL); await p.waitForSelector('[data-curtains="closed"]', { state: 'attached' }); await p.waitForTimeout(150); await p.screenshot({ path: `${OUT}/1-curtains-closed-${name}.png` })
    await p.waitForSelector('[data-curtains="opening"]', { timeout: 20000, state: 'attached' }); await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/2-curtains-mid-open-${name}.png` })
    await p.waitForSelector('[role="dialog"]', { timeout: 15000 }); await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/3-hall-fullscreen-sheet-${name}.png` })
    const free = p.locator('[role="dialog"] [data-seat][aria-label*="free"]').nth(40); await free.click(); await p.waitForTimeout(1200)
    await p.screenshot({ path: `${OUT}/4-hall-peek-after-pick-${name}.png` })
    await p.getByRole('button', { name: 'Continue' }).last().click(); await p.waitForURL(/booking/); console.log(name, '3D flow reached', new globalThis.URL(p.url()).pathname)
    await c.close() }
  { const c = await b.newContext({ viewport: { width, height }, ...rest }); const p = await c.newPage()
    await p.goto(BASE + '/movie/starlight-run/seats?simple=1'); await p.waitForSelector('[role="dialog"] [data-seat]'); await p.waitForTimeout(500)
    await p.screenshot({ path: `${OUT}/5-fallback-simple-${name}.png` }); await c.close() }
  // timing, 3 runs
  const runs = []
  for (let i = 0; i < 3; i++) {
    const c = await b.newContext({ viewport: { width, height }, ...rest }); const p = await c.newPage()
    if (name === 'mobile') { const s = await c.newCDPSession(p); await s.send('Emulation.setCPUThrottlingRate', { rate: 4 }) }
    await p.goto(URL); await p.waitForSelector('[role="dialog"] [data-seat]', { timeout: 30000 })
    const m = await marks(p); runs.push({ ...m, openToGone: m['curtain-gone'] - m['curtain-open'], hallReadyBeforeOpen: m['curtain-open'] - (m['hall-ready'] ?? NaN) }); await c.close()
  }
  timing[name] = runs
}
console.log(JSON.stringify(timing))
// §13 prefetched path: movie page first (idle link prefetch), then seats -> quick curtain (no progress line)
{ const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage()
  await p.goto(BASE + '/movie/starlight-run'); await p.waitForFunction(() => sessionStorage.getItem('lumen.hall3d.prefetched') === '1', null, { timeout: 15000 })
  await p.goto(URL); await p.waitForSelector('[role="dialog"] [data-seat]', { timeout: 30000 })
  console.log('PREFETCHED', JSON.stringify(await marks(p))); await c.close() }
// §14 fps guard: see scripts/qa-fpsguard.mjs
await b.close()
