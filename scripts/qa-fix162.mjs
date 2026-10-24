// fix16.2: phone (touch) taps DURING the Back glide must open the seat that was under the finger at touch-down.
// Taps at 150/250/450/700ms after Back. "Under finger" = __lumenSeatAt at the pointerdown event (capture listener, same task).
// Also checks the access-seat hint text has no stray characters. DEV=desk runs the same with the mouse.
import { chromium } from 'playwright'
const port = process.env.PORT ?? 4191, base = `http://localhost:${port}`, desk = process.env.DEV === 'desk'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const rows = []; const chk = (n, ok, d = '') => { rows.push(ok); console.log(ok ? 'ok  ' : 'FAIL', n, d) }
const ctx = await b.newContext(desk ? { viewport: { width: 1440, height: 900 } } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.addInitScript(() => { window.__downs = []; addEventListener('pointerdown', (e) => { if (e.target.tagName === 'CANVAS') window.__downs.push({ t: e.pointerType, lag: Math.round(performance.now() - e.timeStamp), seat: window.__lumenSeatAt?.(e.clientX, e.clientY) ?? null }) }, true) })
await p.goto(base + '/movie/iron-orchard/seats?show=iron-orchard-2026-10-25-1845&party=1&nofps=1&3d=1')
await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenDrag && window.__lumenSeatXY && window.__lumenSeatAt, null, { timeout: 180000 }); await p.waitForTimeout(2500)
const c = p.getByRole('button', { name: 'Collapse seat picker' }); if (await c.isVisible().catch(() => false)) { await c.click(); await p.waitForTimeout(500) }
const cdp = await ctx.newCDPSession(p)
const view = () => p.evaluate(() => document.querySelector('[data-view]')?.dataset.view)
const settle = async () => { await p.waitForTimeout(700); let l = ''; for (let i = 0; i < 40; i++) { const s = await p.evaluate(() => JSON.stringify(window.__lumenDrag)); if (s === l) return; l = s; await p.waitForTimeout(120) } }
const tap = (x, y) => desk ? p.mouse.click(x, y) : p.touchscreen.tap(x, y)
let skipped = 0
const S = process.env.SEAT ?? (desk ? 'F4' : 'F8')
const { width: W, height: H } = p.viewportSize()
// overview target: F8's final overview position
const home = await p.evaluate((s) => window.__lumenSeatXY(s), S)
for (const ms of [150, 250, 450, 700]) for (let rep = 0; rep < 2; rep++) {
  const h = await p.evaluate((s) => window.__lumenSeatXY(s), S) ?? home; await tap(h.x, h.y); await settle() // into F8 seat view
  if ((await view()) !== S) { chk(`${ms}ms: setup ${S}`, false, await view()); continue }
  await p.evaluate(() => { window.__downs = [] })
  await p.locator('[data-back-overview]').click(); await p.waitForTimeout(ms)
  // finger where F8 is RIGHT NOW (mid glide), not where it will settle
  // the input carries the timestamp of the moment it was aimed (CDP `timestamp`), like a real finger: the hardware time is when it
  // landed, delivery to JS comes later. Mouse goes through the same path so desktop is checked identically.
  // aim right after a frame has been rendered (rAF -> render -> task), so the aimed frame is the one on screen when the input lands
  const xy = await p.evaluate((s) => new Promise((r) => requestAnimationFrame(() => setTimeout(() => r({ ...(window.__lumenSeatXY(s) ?? {}), el: document.elementFromPoint(window.__lumenSeatXY(s)?.x ?? 0, window.__lumenSeatXY(s)?.y ?? 0)?.tagName, ts: (performance.timeOrigin + performance.now()) / 1000 }), 0))), S)
  if (xy.x == null || xy.el !== 'CANVAS') { console.log('skip', ms, `${S} covered/offscreen mid-glide (${xy.el})`); skipped++; await settle(); continue }
  if (desk) { for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: xy.x, y: xy.y, button: 'left', clickCount: 1, timestamp: xy.ts }) }
  else { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: xy.x, y: xy.y }], timestamp: xy.ts }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: xy.ts + 0.06 }) }; await p.waitForTimeout(250)
  const d = await p.evaluate(() => window.__downs.at(-1)); const pk = await p.evaluate(() => JSON.stringify(window.__lumenPick ?? null)); await settle(); const v = await view()
  chk(`${desk ? 'mouse' : 'touch'} tap ${ms}ms into Back glide #${rep + 1}: opened == ${S} (under finger when touched)`, v === S, `aimed ${S}, live-cam seat at down=${d?.seat} (${d?.t}, delivered ${d?.lag}ms late) opened=${v} at=${xy.el} pick=${pk}`)
  if (v !== 'overview') { await p.locator('[data-back-overview]').click().catch(() => {}); await settle() }
}
// access hint
const jx = await p.evaluate(() => window.__lumenSeatXY('J2') ?? window.__lumenSeatXY('J15'))
if (jx) { await tap(jx.x, jx.y); await settle(); const h = await p.locator('[data-seat-hint]').first().textContent().catch(() => null)
  chk('access hint text exact', h === null || h === 'Needs a Disability ticket [PH]', JSON.stringify(h)) }
chk('enough mid-glide taps landed on the canvas', skipped <= 3, `${skipped} skipped`)
chk('no page errors', !errs.length, errs.join('|'))
await b.close(); const ok = rows.every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1)
