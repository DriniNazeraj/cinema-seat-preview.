// fix11 / DESIGN §15.x: grab-the-scene (Street View). drag right -> hall follows finger -> camera looks LEFT (yaw > 0, look dir.x decreases);
// fix12 §15.z: a 3D tap no longer enters a seat view (camera never moves by itself), so only the overview is dragged.
// drag down -> camera looks UP (pitch > 0). Same on mouse + touch, overview + seat view. Phone 2D zoomed pan follows finger (native scroll).
import { chromium } from 'playwright'
const BASE = 'http://localhost:4175/movie/starlight-run/seats?party=1'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const res = {}; let ok = true
const st = (p) => p.evaluate(() => window.__lumenDrag)
async function ready(p) { await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length > 0, null, { timeout: 90000 }); await p.waitForFunction(() => !!window.__lumenDrag); await p.waitForTimeout(2500) }
async function mouseDrag(p, x, y, dx, dy) {
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx, y + dy, { steps: 8 }); await p.waitForTimeout(100); const s = await st(p); await p.mouse.up(); return s
}
async function touchDrag(p, x, y, dx, dy) {
  const cdp = await p.context().newCDPSession(p)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }] })
  await p.waitForTimeout(100); const s = await st(p); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return s
}
async function run(name, ctxOpts, drag, seatView) {
  const c = await b.newContext(ctxOpts), p = await c.newPage(); await p.goto(BASE); await ready(p)
  if (seatView) {
    const free = p.locator('[data-seat]:not([aria-disabled])'); await free.first().waitFor({ timeout: 20000 })
    const id = await free.nth(30).getAttribute('data-seat'); await free.nth(30).click(); await p.waitForTimeout(700)
    if (await p.locator(`[data-seat="${id}"]`).isVisible().catch(() => false)) await p.locator(`[data-seat="${id}"]`).click() // phone: 1st tap zooms, 2nd places
    await p.waitForTimeout(2000)
  }
  // collapse the sheet so the canvas centre is free, then drag in the upper hall area
  if (await p.getByRole('button', { name: 'Collapse seat picker' }).isVisible().catch(() => false)) { await p.getByRole('button', { name: 'Collapse seat picker' }).click(); await p.waitForTimeout(600) }
  const vp = p.viewportSize(), x = vp.width * (ctxOpts.isMobile ? 0.5 : 0.3), y = vp.height * 0.35
  const base = await st(p)
  const r = await drag(p, x, y, 120, 0); await p.waitForTimeout(2500); const d = await drag(p, x, y, 0, 80); await p.waitForTimeout(1500)
  const after = await st(p)
  const out = { view: await p.getAttribute('[data-view]', 'data-view'), rightYaw: +r.yaw.toFixed(3), rightLookDx: +(r.dx - base.dx).toFixed(3), downPitch: +d.pitch.toFixed(3), springBackYaw: +after.yaw.toFixed(3), afterPitch: +after.pitch.toFixed(3) }
  out.pass = out.rightYaw > 0 && out.rightLookDx < 0 && out.downPitch > 0 && Math.abs(out.springBackYaw - out.rightYaw) < 0.02 /* fix12: no auto move after drag */ && (!seatView || out.view !== 'overview')
  res[name] = out; ok &&= out.pass; await c.close()
}
const desk = { viewport: { width: 1440, height: 900 } }, phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
await run('mouse-overview', desk, mouseDrag, false)
await run('touch-overview', phone, touchDrag, false)
{ // phone 2D fit mode: tap zooms; then swipe finger LEFT must move content left (scrollLeft grows)
  const c = await b.newContext(phone), p = await c.newPage(); await p.goto(BASE + '&simple=1'); await p.waitForSelector('[data-seat]')
  await p.locator('[data-seat]').nth(2).tap(); await p.waitForTimeout(800)
  const sc = p.locator('[data-seatgrid]').locator('xpath=..'), bx = await sc.boundingBox(), s0 = await sc.evaluate((e) => e.scrollLeft)
  const cdp = await c.newCDPSession(p), x = bx.x + bx.width / 2, y = bx.y + 20
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 12 * i, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(800)
  const s1 = await sc.evaluate((e) => e.scrollLeft); res['touch-2d-zoomed-pan'] = { swipeLeftScrollDelta: s1 - s0, pass: s1 > s0 }; ok &&= s1 > s0; await c.close()
}
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(res, null, 1)); await b.close(); process.exit(ok ? 0 : 1)
