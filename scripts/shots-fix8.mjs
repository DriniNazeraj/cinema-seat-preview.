// fix8 hall renders: node scripts/shots-fix8.mjs before|after. Picks C8, C9, F8 (selected seats 3 rows ahead of F8),
// shots: view from F8, overview, plus a taken/sheen close look. Needs serve:prod on 4175.
import { chromium } from 'playwright'
const tag = process.argv[2] || 'after', OUT = '/workspace/cinema/final/flow-shots/fix8'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const vps = { desktop: { viewport: { width: 1440, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }
for (const [name, opt] of Object.entries(vps)) {
  const c = await b.newContext(opt); const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://localhost:4175/movie/starlight-run/seats?3d=1&nofps=1'); await p.waitForSelector('[role="dialog"] [data-seat]', { timeout: 30000 })
  const zoom = p.getByRole('button', { name: 'Zoom in on seats' }); if (await zoom.count()) { await zoom.click(); await p.waitForTimeout(300) }
  // a free seat in row F with two free seats 3 rows ahead (row C) at the same columns
  const ids = await p.evaluate(() => {
    const free = new Set([...document.querySelectorAll('[role="dialog"] [data-seat]')].filter((e) => /free/.test(e.getAttribute('aria-label'))).map((e) => e.dataset.seat))
    for (const n of [8, 9, 7, 10, 6, 11]) if (free.has('F' + n) && free.has('C' + n) && free.has('C' + (n + 1))) return ['C' + n, 'C' + (n + 1), 'F' + n]
  })
  console.log('picking', ids)
  for (const id of ids) {
    const s = p.locator(`[role="dialog"] [data-seat="${id}"]`)
    if (!(await s.count())) await p.getByRole('button', { name: 'Change seats' }).click()
    const st = await s.getAttribute('aria-label'); if (/taken/.test(st)) console.log('taken!', id)
    await s.click(); await p.waitForTimeout(400)
  }
  await p.waitForTimeout(1800); await p.screenshot({ path: `${OUT}/${tag}-view-from-F-${name}.png` })
  await p.getByRole('button', { name: 'Reset view' }).click(); await p.waitForTimeout(1800)
  await p.screenshot({ path: `${OUT}/${tag}-overview-selected-${name}.png` })
  console.log(tag, name, 'errs', errs.length, (await p.locator('[data-view]').innerText()))
  await c.close()
}
await b.close()
