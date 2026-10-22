// software GL runs ~10-15 fps here, so timing is coarse: glide = in-between values seen; reduced = straight jump.
// fix12: Reset view / Change seats / entering seat view glide ~400ms ease-out (instant under reduced motion); no auto move after drag.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const R = {}; let ok = true
for (const rm of ['no-preference', 'reduce']) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: rm }), p = await c.newPage()
  await p.goto('http://localhost:4175/movie/starlight-run/seats?party=1&nofps=1')
  await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenDrag, null, { timeout: 90000 }); await p.waitForTimeout(3000)
  if (await p.getByRole('button', { name: 'Collapse seat picker' }).isVisible().catch(() => false)) { await p.getByRole('button', { name: 'Collapse seat picker' }).click(); await p.waitForTimeout(500) }
  await p.mouse.move(400, 300); await p.mouse.down(); await p.mouse.move(520, 300, { steps: 6 }); await p.mouse.up()
  await p.waitForTimeout(1000); const held = (await p.evaluate(() => window.__lumenDrag)).yaw
  const t0 = await p.evaluate(() => performance.now()); await p.getByRole('button', { name: 'Reset view' }).click()
  const samples = []
  for (let i = 0; i < 12; i++) { samples.push(await p.evaluate((t0) => [Math.round(performance.now() - t0), +window.__lumenDrag.yaw.toFixed(3)], t0)); await p.waitForTimeout(60) }
  const zeroAt = samples.find(([, y]) => Math.abs(y) < 0.005)?.[0] ?? null
  const pass = held > 0.4 && zeroAt !== null && (rm === 'reduce' ? !samples.some(([, y]) => y > 0.005 && y < held - 0.005) /* one-frame jump */ : zeroAt <= 900 && samples.some(([, y]) => y > 0.005 && y < held - 0.005) /* in-between frames = glide */)
  R[rm] = { heldAfterDrag1s: held, zeroAt, samples, pass }; ok &&= pass; await c.close()
}
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(R)); await b.close(); process.exit(ok ? 0 : 1)
