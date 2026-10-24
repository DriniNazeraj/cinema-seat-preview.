// fix7: phone fit mode - a tap zooms (centred on the seat), never picks; next tap picks; Enter picks in fit mode; desktop click picks.
import { chromium } from 'playwright'
const OUT = '/workspace/cinema/final/flow-shots/fix7', URL = 'http://localhost:4175/movie/starlight-run/seats?simple=1&party=1'
const b = await chromium.launch(); const r = {}; const errs = []
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const state = (p, sel) => p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return { sheet: !!document.querySelector("[role=dialog]"), peekLabel: document.querySelector(`button[aria-label^="Selected:"]`)?.getAttribute("aria-label") }; const rc = e.getBoundingClientRect()
  return { pressed: e.getAttribute('aria-pressed'), w: Math.round(rc.width), inView: rc.left >= 0 && rc.right <= innerWidth && rc.top >= 0 && rc.bottom <= innerHeight,
    hint: !!document.querySelector('[data-tap-hint]'), sheet: !!document.querySelector('[role=dialog]') } }, sel)
{ const c = await b.newContext(phone); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(URL); await p.waitForSelector('[role=dialog] [data-seat]'); await p.waitForTimeout(400)
  const id = await p.locator('[role=dialog] [data-seat][aria-label*="free"]').nth(40).getAttribute('data-seat'); const sel = `[role=dialog] [data-seat="${id}"]`
  r.fitBefore = await state(p, sel); await p.screenshot({ path: `${OUT}/fit-tap-hint-390.png` })
  await p.locator(sel).tap(); await p.waitForTimeout(500)
  r.afterFirstTap = await state(p, sel); await p.screenshot({ path: `${OUT}/fit-tap-zoomed-390.png` })
  await p.locator(sel).tap(); await p.waitForTimeout(500)
  r.afterSecondTap = await state(p, sel); await c.close() }
{ const c = await b.newContext(phone); const p = await c.newPage()
  await p.goto(URL); await p.waitForSelector('[role=dialog] [data-seat]'); await p.waitForTimeout(400)
  const btn = p.locator('[role=dialog] [data-seat][tabindex="0"]'); const id = await btn.getAttribute('data-seat')
  await btn.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400)
  r.keyboardEnterFit = await p.evaluate((id) => ({ picked: JSON.parse(sessionStorage.getItem('lumen.booking') || 'null')?.seats?.includes?.(id) ?? null, peek: !!document.querySelector('button[aria-label^="Selected:"]'), label: document.querySelector('button[aria-label^="Selected:"]')?.getAttribute('aria-label') }), id)
  await c.close() }
{ const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await c.newPage()
  await p.goto(URL); await p.waitForSelector('[role=dialog] [data-seat]'); await p.locator('[role=dialog] [data-seat][aria-label*="free"]').nth(40).click(); await p.waitForTimeout(400)
  r.desktopClick = { peek: await p.locator('button[aria-label^="Selected:"]').count() > 0 }; await c.close() }
const ok = r.fitBefore.hint && r.fitBefore.w < 44 && r.afterFirstTap.pressed === 'false' && r.afterFirstTap.sheet && r.afterFirstTap.w >= 44 && r.afterFirstTap.inView && !r.afterFirstTap.hint
  && !r.afterSecondTap.sheet && /Selected: [A-Z]/.test(r.afterSecondTap.peekLabel || "") && r.keyboardEnterFit.peek && !/No seats/.test(r.keyboardEnterFit.label || '') && r.desktopClick.peek && !errs.length
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify({ ...r, errs })); await b.close(); process.exit(ok ? 0 : 1)
