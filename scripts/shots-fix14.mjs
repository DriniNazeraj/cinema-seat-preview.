// fix14 screenshots: overview (free / taken / access), hover rim (desktop), seat-view preview rim, selected rim
import { chromium } from 'playwright'
const OUT = '/workspace/cinema/final/flow-shots/fix14'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const [tag, opts, touch] of [['desktop-1440', { viewport: { width: 1440, height: 900 } }, false], ['phone-390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]]) {
  const p = await (await b.newContext({ ...opts, reducedMotion: 'reduce' })).newPage()
  await p.goto('http://localhost:4175/movie/starlight-run/seats?party=1&nofps=1')
  await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenSeatXY, null, { timeout: 90000 }); await p.waitForTimeout(3000)
  await p.screenshot({ path: `${OUT}/${tag}-1-overview.png` })
  const xy = (id) => p.evaluate((id) => window.__lumenSeatXY(id), id)
  const W = p.viewportSize().width
  // drag to the right block of the back rows so the access seats (wheelchair decal) are in frame
  await p.mouse.move(W / 2, 400); await p.mouse.down(); await p.mouse.move(W / 2 - 160, 330, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(800)
  await p.screenshot({ path: `${OUT}/${tag}-2-access-taken.png` })
  await p.getByRole('button', { name: 'Reset view' }).click(); await p.waitForTimeout(800)
  const id = 'E8', q = await xy(id)
  if (!touch && q) { await p.mouse.move(q.x, q.y); await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/${tag}-3-hover.png` }) }
  if (q) { if (touch) await p.touchscreen.tap(q.x, q.y); else await p.mouse.click(q.x, q.y) }
  await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${tag}-4-seatview-preview.png` })
  await p.locator('[data-add-seat]').first().click().catch(() => {}); await p.waitForTimeout(1000)
  await p.screenshot({ path: `${OUT}/${tag}-5-selected.png` })
  await p.locator('[data-back-overview]').click().catch(() => {}); await p.waitForTimeout(1200)
  await p.screenshot({ path: `${OUT}/${tag}-6-selected-overview.png` })
  console.log(tag, 'E8 view:', await p.getAttribute('[data-view]', 'data-view'))
}
await b.close()
