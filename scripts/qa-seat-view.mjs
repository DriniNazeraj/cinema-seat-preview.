// fix13 / DESIGN §15.z rev 5 (+ back end correction): 3D tap flies to the seat POV, selects nothing; only Add seat selects;
// Back to overview (button / Esc / browser back) selects nothing; no snap-back after drag (overview + seat view, 2s);
// Reset view in seat view = that seat's angle; tap another seat in view flies there; taken = viewable, Add disabled;
// access = Add enabled + "Needs a Disability ticket"; price from API (2D €9 / 3D + IMAX €12, never €15); party 2 = "Add seat & place group" -> 2D map, no hold.
import { chromium } from 'playwright'
const BASE = 'http://localhost:4175/movie/starlight-run/seats'
const SHOTS = '/workspace/cinema/final/flow-shots/fix13'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const R = {}; let ok = true; const check = (k, c, i) => { R[k] = { pass: !!c, ...(i ?? {}) }; ok &&= !!c }
const cart = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem('lumen.cart') || '{}'))
const cam = (p) => p.evaluate(() => ({ ...window.__lumenDrag }))
const view = (p) => p.getAttribute('[data-view]', 'data-view')
async function setup(p, q) {
  await p.goto(BASE + q); await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenSeatXY, null, { timeout: 90000 }); await p.waitForTimeout(3000)
  await p.waitForSelector('[data-seat]', { state: 'attached' })
  const seats = await p.$$eval('[data-seat]', (els) => els.map((e) => ({ id: e.dataset.seat, l: e.getAttribute('aria-label') })))
  if (await p.getByRole('button', { name: 'Collapse seat picker' }).isVisible().catch(() => false)) { await p.getByRole('button', { name: 'Collapse seat picker' }).click(); await p.waitForTimeout(600) }
  return { free: seats.filter((s) => / free,/.test(s.l) && !s.l.includes('wheelchair')).map((s) => s.id), taken: seats.filter((s) => / taken,/.test(s.l)).map((s) => s.id), access: seats.filter((s) => s.l.includes('wheelchair') && / free,/.test(s.l)).map((s) => s.id) }
}
async function tap(p, id, touch) {
  const { width: W, height: H } = p.viewportSize(), bad = (q) => !q || q.x < 16 || q.y < 60 || q.x > W - 16 || q.y > H - 70
  let xy = await p.evaluate((id) => window.__lumenSeatXY(id), id)
  // fix13: a seat outside the frame is reached like a visitor would: drag to look around, then tap
  // fix15: with 360° yaw, tilt-down and 1.25× zoom-out the phone corners (incl. access J15/J16) are reachable too
  for (const [dx, dy, zoom] of [[160, 0], [-160, 0], [160, -70], [-160, -70], [0, -70], [160, 70], [-160, 70],
    [0, 0, 1], [0, -70, 1], [0, -130, 1], [160, -130, 1], [-160, -130, 1], [100, -100, 1], [-100, -100, 1], [220, -60, 1], [-220, -60, 1]]) {
    if (!bad(xy)) break
    if (zoom) { await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, 400); await p.waitForTimeout(150) }
    await p.mouse.move(W / 2, H / 2); await p.mouse.down(); await p.mouse.move(W / 2 + dx, H / 2 + dy, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(400)
    xy = await p.evaluate((id) => window.__lumenSeatXY(id), id)
    if (bad(xy)) { await p.getByRole('button', { name: 'Reset view' }).click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(500) }
  }
  if (bad(xy)) return false
  if (touch) await p.touchscreen.tap(xy.x, xy.y); else await p.mouse.click(xy.x, xy.y)
  await p.waitForTimeout(900); return true
}
async function findTap(p, list, touch, avoid = [], stay = false) { // stay=false: a miss (other seat) goes back to the overview before the next try
  for (const id of list.filter((x) => !avoid.includes(x)).slice(0, 30)) { if (!(await tap(p, id, touch))) continue; const v = await view(p); if (v === id) return id; if (!stay && v !== 'overview') { await p.locator('[data-back-overview]').click(); await p.waitForTimeout(900) } }
  return null
}
const back = async (p) => { await p.locator('[data-back-overview]').click(); await p.waitForTimeout(900) }
async function dragHold(p, touch) {
  const vw = p.viewportSize().width
  if (touch) { const s = await p.evaluate(() => { const c = document.querySelector('canvas'); return !!c }); if (!s) return null }
  await p.mouse.move(vw / 2 - 60, 250); await p.mouse.down(); await p.mouse.move(vw / 2 + 60, 280, { steps: 6 }); await p.mouse.up()
  await p.waitForTimeout(200); const a = await cam(p); await p.waitForTimeout(2000); const z = await cam(p)
  return { a, z, still: Math.abs(a.yaw) > 0.2 && Math.abs(a.yaw - z.yaw) < 1e-6 && Math.abs(a.pitch - z.pitch) < 1e-6 && Math.abs(a.dx - z.dx) < 1e-6 && Math.abs(a.dy - z.dy) < 1e-6 }
}
for (const [tag, opts, touch] of [['desktop-1440', { viewport: { width: 1440, height: 900 } }, false], ['phone-390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]]) {
  const c = await b.newContext(opts), p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  const s = await setup(p, '?party=1&nofps=1')
  const mid = s.free.filter((id) => 'DEFG'.includes(id[0]))
  const d0 = await dragHold(p, touch); check(`${tag}-overview-drag-holds-2s`, d0?.still, d0)
  await p.getByRole('button', { name: 'Reset view' }).click(); await p.waitForTimeout(900)
  const a = await findTap(p, mid, touch)
  const c1 = await cart(p)
  check(`${tag}-tap-flies-to-pov-selects-nothing`, a && (c1.seats ?? []).length === 0 && !c1.holdId, { a, seats: c1.seats })
  const bar = a ? await p.locator('[data-seatview]').innerText() : ''
  const fmt = (await p.locator('body').innerText()).match(/· (2D|3D|IMAX) ·/)?.[1], fmtPrice = { '2D': 9, '3D': 12, IMAX: 12 }[fmt] // lib/api PRICE (fix13: no IMAX surcharge)
  check(`${tag}-bar-label-price-from-api`, bar.includes(`Seat ${a} · Row ${a?.[0]} · €${fmtPrice}`) && !bar.includes('€15'), { bar, fmt, expect: fmtPrice })
  check(`${tag}-add-seat-button`, await p.getByRole('button', { name: 'Add seat', exact: true }).isEnabled())
  check(`${tag}-aria-live`, (await p.locator('[data-say]').textContent()).startsWith(`Viewing from ${a}. Press Add seat`))
  const bb = await p.locator('[data-back-overview]').boundingBox()
  check(`${tag}-back-44px-labelled`, bb && bb.height >= 44 && bb.x < 40 && (await p.locator('[data-back-overview]').getAttribute('aria-label')) === 'Back to overview', { bb })
  await p.screenshot({ path: `${SHOTS}/${tag}-1-seat-view.png` })
  const d1 = await dragHold(p, touch); check(`${tag}-seatview-drag-holds-2s`, d1?.still && (await view(p)) === a, d1)
  await p.getByRole('button', { name: 'Reset view' }).click(); await p.waitForTimeout(900)
  const r = await cam(p); check(`${tag}-reset-in-seatview-to-seat-angle`, (await view(p)) === a && Math.abs(r.yaw) < 1e-3, { r })
  const b2 = await findTap(p, s.free.filter((id) => id < a[0] + 'z' && id[0] < a?.[0]), touch, [a], true) // a seat ahead, visible from this POV
  check(`${tag}-tap-other-in-view-flies-there`, b2 && (await view(p)) === b2 && ((await cart(p)).seats ?? []).length === 0, { b2 })
  await back(p); const c2 = await cart(p)
  check(`${tag}-back-button-selects-nothing`, (await view(p)) === 'overview' && (c2.seats ?? []).length === 0)
  if (!touch) { await findTap(p, mid, touch); await p.keyboard.press('Escape'); await p.waitForTimeout(900); check(`${tag}-esc-to-overview`, (await view(p)) === 'overview' && ((await cart(p)).seats ?? []).length === 0) }
  await findTap(p, mid, touch); await p.goBack(); await p.waitForTimeout(900)
  check(`${tag}-browser-back-to-overview`, (await view(p)) === 'overview' && p.url().includes('/seats') && ((await cart(p)).seats ?? []).length === 0, { url: p.url() })
  const t = await findTap(p, s.taken.filter((id) => 'CDEFGH'.includes(id[0])), touch)
  const tb = p.locator('[data-add-seat]')
  check(`${tag}-taken-viewable-add-disabled`, t && await tb.isDisabled() && (await tb.innerText()).includes('Taken'), { t })
  if (t) await p.screenshot({ path: `${SHOTS}/${tag}-2-taken-seat.png` })
  if (t) await back(p)
  const acc = await findTap(p, s.access, touch)
  check(`${tag}-access-add-enabled-with-hint`, acc && await tb.isEnabled() && (await p.locator('[data-seat-hint]').innerText()).includes('Needs a Disability ticket'), { acc, access: s.access })
  if (acc) { await p.screenshot({ path: `${SHOTS}/${tag}-3-access-seat.png` }); await back(p) }
  const f = await findTap(p, mid, touch)
  await p.getByRole('button', { name: 'Add seat', exact: true }).click(); await p.waitForTimeout(500)
  const c3 = await cart(p)
  check(`${tag}-add-seat-selects`, JSON.stringify(c3.seats) === JSON.stringify([f]) && !c3.holdId && await p.getByRole('button', { name: 'Continue' }).isEnabled(), { f, seats: c3.seats })
  await p.screenshot({ path: `${SHOTS}/${tag}-4-added.png` })
  await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForFunction(() => location.pathname === '/booking', null, { timeout: 5000 }).catch(() => {})
  const c4 = await cart(p); check(`${tag}-continue-holds`, p.url().endsWith('/booking') && !!c4.holdId)
  check(`${tag}-no-errors`, !errs.length, { errs }); await c.close()
}
{ // party 2
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await c.newPage()
  const s = await setup(p, '?party=2&nofps=1'); const a = await findTap(p, s.free.filter((id) => 'DEFG'.includes(id[0])), false)
  const btn = p.getByRole('button', { name: 'Add seat & place group' })
  check('party2-button-label', a && await btn.isVisible() && ((await cart(p)).seats ?? []).length === 0)
  await btn.click(); await p.waitForTimeout(700)
  const sel = await p.$$eval('[data-seat][aria-pressed="true"]', (e) => e.map((x) => x.dataset.seat)); const c1 = await cart(p)
  check('party2-places-group-opens-2d-no-hold', sel.includes(a) && (sel.length === 2 || (await p.locator('[data-short]').count()) > 0) && !c1.holdId, { a, sel })
  await p.screenshot({ path: `${SHOTS}/desktop-1440-5-party2-map.png` }); await c.close()
}
{ // reduced motion: seat view instant
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }), p = await c.newPage()
  const s = await setup(p, '?party=1&nofps=1'); const a = await findTap(p, s.free.filter((id) => 'DEFG'.includes(id[0])), false)
  check('reduced-motion-seat-view', !!a, { a }); await c.close()
}
for (const [k, v] of Object.entries(R)) console.log(v.pass ? "ok  " : "FAIL", k, v.pass ? "" : JSON.stringify(v)); console.log(ok ? "PASS" : "FAIL"); await b.close(); process.exit(ok ? 0 : 1)
