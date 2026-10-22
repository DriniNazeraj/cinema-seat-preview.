// fix12 / DESIGN §15.w: 3D | Simple radio group ("Hall view"), always visible; simple -> 3D -> simple at 390x844 keeps party, picks
// and hold, flips ?simple=1 (replaceState), persists across reload. Variants: start ?simple=1, reduced motion, low-fps (?fps=slow).
import { chromium } from 'playwright'
const BASE = 'http://localhost:4175/movie/starlight-run/seats'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const R = {}; let ok = true; const check = (k, c, i) => { R[k] = { pass: !!c, ...(i ?? {}) }; ok &&= !!c }
const cart = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem('lumen.cart') || '{}'))
const radio = (p, v) => p.locator(`[data-viewswitch] input[value="${v}"]`)
const hallReady = (p) => p.waitForFunction(() => !!document.querySelector('canvas') && performance.getEntriesByName('lumen:hall-ready').length > 0, null, { timeout: 90000 }).then(() => true, () => false)
for (const [tag, rm, q] of [['simple-start', 'no-preference', '?simple=1&party=2'], ['reduced', 'reduce', '?simple=1&party=2'], ['lowfps', 'no-preference', '?simple=1&party=2&fps=slow']]) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: rm }), p = await c.newPage()
  const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(BASE + q); await p.waitForSelector('[data-viewswitch]')
  const grp = p.locator('[role=radiogroup][aria-label="Hall view"]')
  const lab = p.locator('[data-viewswitch] label').first(), bb = await lab.boundingBox()
  const tapOk = await p.evaluate(({ x, y }) => [y - 21, y + 21].every((yy) => !!document.elementFromPoint(x, yy)?.closest('[data-viewswitch] label')), { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 })
  check(`${tag}-radiogroup-visible-simple-checked`, await grp.isVisible() && await radio(p, 'simple').isChecked() && !(await p.locator('canvas').count()))
  check(`${tag}-segment-36px-tap-44px`, Math.round(bb.height) === 36 && tapOk, { h: bb.height })
  // pick a group of 2 in the 2D map (phone: 1st tap zooms, 2nd places)
  const free = p.locator('[data-seat][aria-label*=" free,"]:not([aria-label*="wheelchair"])'); const id = await free.nth(20).getAttribute('data-seat')
  await p.locator(`[data-seat="${id}"]`).tap(); await p.waitForTimeout(300); await p.locator(`[data-seat="${id}"]`).tap(); await p.waitForTimeout(400)
  const picks0 = (await cart(p)).seats
  await p.locator('[data-viewswitch] label:has(input[value="3d"])').tap()
  const ready = await hallReady(p); await p.waitForTimeout(1500)
  const c1 = await cart(p), url1 = new URL(p.url())
  check(`${tag}-to-3d`, ready && await radio(p, '3d').isChecked() && !url1.searchParams.has('simple') && (await p.evaluate(() => localStorage.getItem('lumen.simple'))) === null, { url: url1.search })
  check(`${tag}-keeps-party-picks`, c1.partySize === 2 && JSON.stringify(c1.seats) === JSON.stringify(picks0) && picks0.length > 0, { picks0, now: c1.seats })
  await p.reload(); const ready2 = await hallReady(p)
  check(`${tag}-3d-persists-after-reload`, ready2 && await radio(p, '3d').isChecked())
  await p.locator('[data-viewswitch] label:has(input[value="simple"])').tap(); await p.waitForTimeout(800)
  const c2 = await cart(p)
  check(`${tag}-back-to-simple`, await radio(p, 'simple').isChecked() && new URL(p.url()).searchParams.get('simple') === '1' && !(await p.locator('canvas').count()) && JSON.stringify(c2.seats) === JSON.stringify(picks0) && !(await p.getByText('3D view paused').count()))
  await p.goto(BASE + '?party=2'); await p.waitForSelector('[data-viewswitch]'); await p.waitForTimeout(800)
  check(`${tag}-simple-persists-after-reload`, await radio(p, 'simple').isChecked() && !(await p.locator('canvas').count()))
  check(`${tag}-no-errors`, !errs.length, { errs })
  await c.close()
}
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(R, null, 1)); await b.close(); process.exit(ok ? 0 : 1)
