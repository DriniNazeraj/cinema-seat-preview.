// fix15.3: real-pointer checks (page.mouse / page.touchscreen at client coords, motion ON, no reduced-motion shortcut).
// PART=chip  desktop, sheet open, seat view: yaw exactly -180/180/179/181 + a mouse drag -> real click on the Screen chip -> yaw 0,
//            chip hidden, sheet still open; chip must be the top element at its centre (not covered).
// PART=hyst  overview + seat view hysteresis: 90 hidden, 96 shown, 90 still shown, 84 hidden; 6 arrow presses (90°) hidden.
// PART=taps  every on-screen seat by real click after a fly (seat -> Back) and after look-around drags; DEV=phone uses touch taps
//            (phone: seats needing tilt/zoom are left to qa-hit-test; needs >= 75 taps = QA's sample, 0 wrong).
import { chromium } from 'playwright'
const port = process.env.PORT ?? 4175, base = `http://localhost:${port}`, PART = process.env.PART ?? 'chip,hyst,taps', ph = process.env.DEV === 'phone'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const rows = []; const chk = (n, ok, d = '') => { rows.push(ok); console.log(ok ? 'ok  ' : 'FAIL', n, d) }
const open = async (ctx, url) => {
  const p = await (await b.newContext(ctx)).newPage(); await p.goto(base + url)
  await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenDrag && window.__lumenSeatXY && window.__lumenSetYaw, null, { timeout: 180000 }); await p.waitForTimeout(2500); return p
}
const settle = async (p) => { await p.waitForTimeout(700); let last = ''; for (let i = 0; i < 40; i++) { const s = await p.evaluate(() => JSON.stringify([window.__lumenDrag.px, window.__lumenDrag.pz, window.__lumenDrag.yaw, window.__lumenDrag.pitch])); if (s === last) return; last = s; await p.waitForTimeout(120) } }
const st = (p) => p.evaluate(() => ({ t: window.__lumenDrag.t, yaw: window.__lumenDrag.yaw, chip: document.querySelector('[data-screen-chip]')?.dataset.screenChip, view: document.querySelector('[data-view]')?.dataset.view, sheet: !!document.querySelector('[role=dialog]') }))
const DESK = { viewport: { width: 1440, height: 900 } }, PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const SHOW = '/movie/iron-orchard/seats?show=iron-orchard-2026-10-25-1845&party=1&nofps=1&3d=1'
// QA hook quirk (see report): the very first __lumenSetYaw after load is sometimes lost; set, verify, retry once
const setYaw = async (p, a) => { for (let i = 0; i < 2; i++) { await p.evaluate((a) => window.__lumenSetYaw(a), a); await p.waitForTimeout(300); if (Math.abs((await st(p)).yaw - a * Math.PI / 180) < 1e-9) return } }
const tapSeat = async (p, id) => { const xy = await p.evaluate((id) => window.__lumenSeatXY(id), id); if (!xy) return false; if (ph) await p.touchscreen.tap(xy.x, xy.y); else await p.mouse.click(xy.x, xy.y); return true }
const clickChip = async (p) => {
  const r = await p.locator('[data-screen-chip]').boundingBox(); const x = r.x + r.width / 2, y = r.y + r.height / 2
  const top = await p.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-screen-chip]'), { x, y })
  await p.mouse.click(x, y); await p.waitForTimeout(1300); return top
}

if (PART.includes('chip')) {
  const p = await open(DESK, SHOW)
  if (!(await p.getByRole('dialog').count())) { await p.locator('[aria-label*="Open seat picker"]').click().catch(() => {}); await p.waitForTimeout(600) }
  await tapSeat(p, 'E8'); await settle(p); const s0 = await st(p)
  chk('chip: entered seat view E8 with sheet open', s0.view === 'E8' && s0.sheet, JSON.stringify(s0))
  for (const a of [-180, 180, 179, 181]) {
    await setYaw(p, a); await p.waitForTimeout(100); const before = await st(p)
    const top = await clickChip(p); const after = await st(p)
    chk(`chip: real click at ${a}°`, before.chip !== 'hidden' && top && after.yaw === 0 && after.chip === 'hidden' && after.sheet && after.view === 'E8', `before ${before.yaw.toFixed(4)}/${before.chip} top=${top} after ${after.yaw}/${after.chip} sheet=${after.sheet}`)
  }
  // drag ~180° (0.004 rad/px) in two strokes on the canvas left of the sheet
  for (const dx of [-400, -400]) { await p.mouse.move(600, 450); await p.mouse.down(); await p.mouse.move(600 + dx, 450, { steps: 16 }); await p.mouse.up(); await p.waitForTimeout(150) }
  await p.waitForTimeout(300); const bd = await st(p); const top = await clickChip(p); const ad = await st(p)
  chk('chip: real click after a mouse drag', bd.chip !== 'hidden' && top && ad.yaw === 0 && ad.chip === 'hidden' && ad.sheet, `before ${bd.yaw.toFixed(3)}/${bd.chip} top=${top} after ${ad.yaw}/${ad.chip}`)
  await p.context().close()
}
if (PART.includes('hyst')) {
  const p = await open(DESK, SHOW)
  const c = p.getByRole('button', { name: 'Collapse seat picker' }); if (await c.isVisible().catch(() => false)) { await c.click(); await p.waitForTimeout(500) }
  for (const where of ['overview', 'E8']) {
    if (where === 'E8') { await tapSeat(p, 'E8'); await settle(p) }
    const seq = []
    for (const a of [90, 96, 90, 84]) { await setYaw(p, a); const q = await st(p); seq.push(q.chip + '@' + q.yaw.toFixed(2) + '/t' + q.t) }
    chk(`hysteresis ${where}: 90 hidden, 96 shown, 90 shown, 84 hidden`, seq[0].startsWith('hidden') && !seq[1].startsWith('hidden') && !seq[2].startsWith('hidden') && seq[3].startsWith('hidden'), seq.join(','))
    await p.evaluate(() => window.__lumenSetYaw(0)); await p.waitForTimeout(300)
    await p.locator('canvas').focus(); for (let i = 0; i < 6; i++) { await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150) }
    await p.waitForTimeout(300); const k = await st(p)
    chk(`hysteresis ${where}: 6× ← (90°) hidden`, Math.abs(k.yaw - Math.PI / 2) < 1e-9 && k.chip === 'hidden', `${k.yaw.toFixed(4)} ${k.chip}`)
    await p.evaluate(() => window.__lumenSetYaw(0)); await p.waitForTimeout(300)
  }
  await p.context().close()
}
if (PART.includes('taps')) {
  const p = await open(ph ? PHONE : DESK, '/movie/starlight-run/seats?party=1&nofps=1')
  if (!(await p.locator('[data-seat]').count())) { await p.locator('[aria-label*="Open seat picker"]').click(); await p.waitForTimeout(800) }
  const ids = await p.$$eval('[data-seat]', (e) => e.map((x) => x.dataset.seat))
  const c = p.getByRole('button', { name: 'Collapse seat picker' }); if (await c.isVisible().catch(() => false)) { await c.click(); await p.waitForTimeout(500) }
  const { width: W, height: H } = p.viewportSize(); let tried = 0; const miss = []
  const back = async () => { if ((await st(p)).view !== 'overview') { await p.locator('[data-back-overview]').click({ timeout: 3000 }).catch(() => {}) } await settle(p) }
  for (const [i, id] of ids.entries()) {
    // every 4th seat: look around first (mouse/finger drag, then Reset) so the tap follows a camera move, not just a fly
    if (i % 4 === 3) { await p.mouse.move(W / 2, H / 2); await p.mouse.down(); await p.mouse.move(W / 2 + 120, H / 2 + 40, { steps: 8 }); await p.mouse.up(); await settle(p) }
    let xy = await p.evaluate((id) => window.__lumenSeatXY(id), id)
    if (!xy || xy.x < 16 || xy.x > W - 16 || xy.y < 58 || xy.y > H - 66 || await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName !== 'CANVAS', xy)) {
      await p.locator('[aria-label*="Reset view"]').first().click().catch(() => {}); await settle(p); xy = await p.evaluate((id) => window.__lumenSeatXY(id), id)
      if (!xy || xy.y < 58 || xy.y > H - 66 || await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName !== 'CANVAS', xy)) continue
    }
    tried++; if (ph) await p.touchscreen.tap(xy.x, xy.y); else await p.mouse.click(xy.x, xy.y)
    await p.waitForTimeout(250); const v = (await st(p)).view; if (v !== id) miss.push(`${id}->${v}`)
    await back() // the next tap follows a real 400ms fly back
  }
  chk(`taps ${ph ? 'phone (touch)' : 'desktop sheet closed (mouse)'}: ${tried - miss.length}/${tried} of ${ids.length}`, tried >= (ph ? 75 : ids.length * 0.8) && !miss.length, miss.join(' '))
}
await b.close(); const ok = rows.every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1)
