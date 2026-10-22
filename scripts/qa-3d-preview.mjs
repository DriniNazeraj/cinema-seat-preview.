// fix12 / DESIGN §15.z: 3D tap only previews one seat (no selection, camera stays); party 1 Continue selects it;
// party >= 2 "Use this seat" places the group in the 2D map (no hold until Continue); taken/wheelchair = hint only; 2D still multi-selects.
import { chromium } from 'playwright'
const BASE = 'http://localhost:4175/movie/starlight-run/seats'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const R = {}; let ok = true; const check = (k, c, i) => { R[k] = { pass: !!c, ...(i ?? {}) }; ok &&= !!c }
const cart = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem('lumen.cart') || '{}'))
const cam = (p) => p.evaluate(() => ({ ...window.__lumenDrag }))
async function setup(p, q) {
  await p.goto(BASE + q); await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenSeatXY, null, { timeout: 90000 }); await p.waitForTimeout(3000)
  await p.waitForSelector('[data-seat]')
  const seats = await p.$$eval('[data-seat]', (els) => els.map((e) => ({ id: e.dataset.seat, l: e.getAttribute('aria-label') })))
  if (await p.getByRole('button', { name: 'Collapse seat picker' }).isVisible().catch(() => false)) { await p.getByRole('button', { name: 'Collapse seat picker' }).click(); await p.waitForTimeout(600) }
  return { free: seats.filter((s) => / free,/.test(s.l) && !s.l.includes('wheelchair')).map((s) => s.id), taken: seats.filter((s) => / taken,/.test(s.l)).map((s) => s.id), access: seats.filter((s) => s.l.includes('wheelchair') && / free,/.test(s.l)).map((s) => s.id) }
}
async function tap3D(p, id, touch) {
  const xy = await p.evaluate((id) => window.__lumenSeatXY(id), id); if (!xy) return false
  if (touch) await p.touchscreen.tap(xy.x, xy.y); else await p.mouse.click(xy.x, xy.y)
  await p.waitForTimeout(500); return true
}
const previewing = async (p) => (await p.locator('[data-previewing]').count()) ? (await p.locator('[data-previewing]').innerText()).split('\n')[0] : null
async function findTappable(p, list, touch, avoid = []) { // first seat (middle rows) whose tap previews exactly it
  const order = list.filter((id) => 'DEFG'.includes(id[0]) && !avoid.includes(id))
  for (const id of order.slice(0, 25)) { await tap3D(p, id, touch); const pv = await previewing(p); if (pv === `Previewing ${id}`) return id; if (pv) { await p.getByRole('button', { name: /Clear preview/ }).click(); await p.waitForTimeout(200) } }
  return null
}
for (const [tag, opts, touch] of [['desktop', { viewport: { width: 1440, height: 900 } }, false], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]]) {
  const c = await b.newContext(opts), p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  const s = await setup(p, '?party=1&nofps=1'); const cam0 = await cam(p)
  const a = await findTappable(p, s.free, touch)
  const c1 = await cart(p), cam1 = await cam(p)
  check(`${tag}-tap-previews-not-selects`, a && (c1.seats ?? []).length === 0 && !c1.holdId, { a, seats: c1.seats })
  check(`${tag}-camera-stays-on-tap`, Math.abs(cam1.dx - cam0.dx) < 1e-6 && Math.abs(cam1.dy - cam0.dy) < 1e-6 && (await p.getAttribute('[data-view]', 'data-view')) === 'overview')
  check(`${tag}-aria-live`, (await p.locator('[data-say]').textContent()).startsWith(`Previewing ${a}. Press Continue to select`))
  check(`${tag}-no-3d-shift-or-short`, (await p.locator('[data-shift]').count()) === 0 && (await p.locator('[data-short]').count()) === 0)
  const b2 = await findTappable(p, s.free, touch, [a])
  check(`${tag}-tap-other-moves-preview`, b2 && (await previewing(p)) === `Previewing ${b2}`, { b2 })
  await tap3D(p, b2, touch); check(`${tag}-tap-same-clears`, (await previewing(p)) === null)
  let hinted = false; const tried = []
  for (const t of s.taken.filter((id) => 'DEFG'.includes(id[0])).slice(0, 15)) { await tap3D(p, t, touch); const h = await p.locator('[data-hint3d]').count() ? await p.locator('[data-hint3d]').innerText() : null; tried.push([t, h, await previewing(p)]); if (h) { hinted = h.includes('Taken') && (await previewing(p)) === null; break } if (await previewing(p)) { await p.getByRole('button', { name: /Clear preview/ }).click(); await p.waitForTimeout(200) } }
  check(`${tag}-taken-hint-no-outline`, hinted, { tried })
  await findTappable(p, [b2], touch); await p.getByRole('button', { name: 'Continue' }).click()
  await p.waitForFunction(() => location.pathname === '/booking', null, { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(400)
  const c2 = await cart(p); check(`${tag}-party1-continue-selects-exactly-one`, p.url().endsWith('/booking') && JSON.stringify(c2.seats) === JSON.stringify([b2]) && !!c2.holdId, { seats: c2.seats, holdId: c2.holdId })
  check(`${tag}-no-errors`, !errs.length, { errs }); await c.close()
}
{ // party 2: Use this seat -> group in 2D map, nothing held
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await c.newPage()
  const s = await setup(p, '?party=2&nofps=1'); const a = await findTappable(p, s.free, false)
  const btn = p.getByRole('button', { name: /Use this seat/ })
  check('party2-button-reads-use-this-seat', a && await btn.isVisible() && (await p.getByRole('button', { name: 'Continue' }).count()) === 0)
  await btn.click(); await p.waitForTimeout(600)
  const sel = await p.$$eval('[data-seat][aria-pressed="true"]', (e) => e.map((x) => x.dataset.seat)); const c1 = await cart(p)
  check('party2-places-group-in-2d-no-hold', (await p.locator('[data-seat]').first().isVisible()) && sel.includes(a) && (sel.length === 2 || (await p.locator('[data-short]').count()) > 0) && !c1.holdId, { a, sel, holdId: c1.holdId })
  // 2D still multi-selects: tap another free seat moves the group of 2
  const other = s.free.find((id) => id[0] === 'B' && !sel.includes(id))
  await p.locator(`[data-seat="${other}"]`).click(); await p.waitForTimeout(400)
  if (!(await p.locator('[data-seat]').first().isVisible().catch(() => false))) { await p.locator('[aria-label*="Open seat picker"]').click(); await p.waitForTimeout(400) }
  const sel2 = await p.$$eval('[data-seat][aria-pressed="true"]', (e) => e.map((x) => x.dataset.seat))
  check('2d-still-multi-selects', sel2.includes(other) && sel2.length >= 1 && !(await cart(p)).holdId, { other, sel2 })
  await c.close()
}
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(R, null, 1)); await b.close(); process.exit(ok ? 0 : 1)
