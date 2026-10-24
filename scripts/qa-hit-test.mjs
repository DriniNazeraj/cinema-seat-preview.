// fix13: whole-hall tap test. In the overview, tap every seat at its projected back and check the seat view opens on THAT seat.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
let ok = true
for (const [tag, opts, touch] of [['desktop-1440', { viewport: { width: 1440, height: 900 } }, false], ['phone-390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' }, true]]) {
  if (process.env.DEV && !tag.startsWith(process.env.DEV)) continue
  const p = await (await b.newContext({ ...opts, reducedMotion: 'reduce' })).newPage()
  await p.goto('http://localhost:4175/movie/starlight-run/seats?party=1&nofps=1')
  await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenSeatXY, null, { timeout: 90000 }); await p.waitForTimeout(2500)
  if (!(await p.locator('[data-seat]').count())) { await p.locator('[aria-label*="Open seat picker"]').click(); await p.waitForTimeout(800) }
  await p.waitForSelector('[data-seat]', { state: 'attached', timeout: 30000 })
  const ids = await p.$$eval('[data-seat]', (e) => e.map((x) => x.dataset.seat))
  // fix15: SHEET=1 keeps the seat sheet open (desktop: side panel) to prove taps still land with it showing
  if (!process.env.SHEET && await p.getByRole('button', { name: 'Collapse seat picker' }).isVisible().catch(() => false)) { await p.getByRole('button', { name: 'Collapse seat picker' }).click(); await p.waitForTimeout(500) }
  const { width: W, height: H } = p.viewportSize(); let hit = 0, tried = 0; const miss = [], skipped = []
  for (const id of (process.env.N ? ids.slice(0, +process.env.N) : ids)) {
    let xy = await p.evaluate((id) => window.__lumenSeatXY(id), id)
    const bad = (q) => !q || q.x < 16 || q.x > W - 16 || q.y < 58 || q.y > H - 66
    // whole hall: a seat outside the overview frame is reached the way a visitor would — drag to look around, then tap
    // fix15 §15.u rev 3: 360° yaw, tilt down to 30° and zoom out to 1.25× reach the phone corners (I1/I16/J1-3/J14-16)
    for (const [dx, dy, zoom] of [[160, 0], [-160, 0], [160, 70], [-160, 70], [0, 70], [160, -70], [-160, -70], [0, -70], [80, -70], [-80, -70],
      [0, 0, 1], [0, -70, 1], [0, -130, 1], [160, -130, 1], [-160, -130, 1], [100, -100, 1], [-100, -100, 1], [220, -60, 1], [-220, -60, 1], [400, 0, 1], [-400, 0, 1]]) {
      if (!bad(xy)) break
      if (zoom) { await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, 400); await p.waitForTimeout(150) }
      await p.mouse.move(W / 2, H / 2); await p.mouse.down(); await p.mouse.move(W / 2 + dx, H / 2 + dy, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300)
      xy = await p.evaluate((id) => window.__lumenSeatXY(id), id)
      if (bad(xy)) { await p.locator('[data-reset-view], [aria-label*="Reset view"]').first().click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(300) }
    }
    if (bad(xy)) { skipped.push(id + ':off'); continue }
    const el = await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e?.tagName === 'CANVAS' ? null : (e?.tagName + '.' + String(e?.className).slice(0, 30)) }, xy)
    if (el) { skipped.push(id + ':' + el); continue } // covered by UI
    tried++; if (touch) await p.touchscreen.tap(xy.x, xy.y); else await p.mouse.click(xy.x, xy.y)
    await p.waitForTimeout(400); const v = await p.getAttribute('[data-view]', 'data-view')
    if (v === id) hit++; else miss.push(`${id}->${v}`); if (process.env.PROGRESS) console.error(tag, id, v)
    if (v !== 'overview') { await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(150); if ((await p.getAttribute('[data-view]', 'data-view')) !== 'overview') await p.locator('[data-back-overview]').click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(400) }
  }
  const pass = tried > 0 && miss.length === 0 && (!process.env.STRICT || skipped.length === 0); ok &&= pass
  console.log(pass ? 'ok  ' : 'FAIL', tag, `hit ${hit}/${tried} of ${process.env.N ? +process.env.N : ids.length}, off-screen/covered ${skipped.length}`, miss.length ? 'miss: ' + miss.join(' ') : '', skipped.length ? 'skipped: ' + skipped.join(' ') : '')
}
console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1)
