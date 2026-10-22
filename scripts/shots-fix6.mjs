// fix6 designer review shots: node scripts/shots-fix6.mjs before|after. Needs serve:prod on 4175.
import { chromium } from 'playwright'
const tag = process.argv[2] || 'after', OUT = process.env.OUT || '/workspace/cinema/final/flow-shots/fix6'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const vps = { desktop: { viewport: { width: 1280, height: 800 } }, mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } }
const res = {}
for (const [name, opt] of Object.entries(vps)) {
  const c = await b.newContext(opt); const p = await c.newPage()
  await p.goto('http://localhost:4175/movie/starlight-run/seats?simple=1'); await p.waitForSelector('[role="dialog"] [data-seat]'); await p.waitForTimeout(500)
  const info = await p.evaluate(() => {
    const g = document.querySelector('[data-seatgrid]'), sc = g.parentElement, d = document.querySelector('[role="dialog"]')
    const btn = g.querySelector('[data-seat]').getBoundingClientRect()
    return { focused: (document.activeElement.textContent || document.activeElement.getAttribute('aria-label') || '').slice(0, 40), panelW: Math.round(d.getBoundingClientRect().width),
      clipped: sc.scrollWidth > sc.clientWidth + 1, seatHit: Math.round(btn.width) }
  })
  await p.screenshot({ path: `${OUT}/${tag}-sheet-simple-${name}.png` })
  { const f = p.locator('[role="dialog"] [data-seat][aria-label*="free"]').nth(40); await f.click(); await p.waitForTimeout(300); if (await p.locator('[role="dialog"]').count()) await f.click() } await p.waitForTimeout(700)
  info.collapsedAfterPick = (await p.locator('[role="dialog"]').count()) === 0
  await p.screenshot({ path: `${OUT}/${tag}-after-pick-simple-${name}.png` })
  if (tag === 'after' && name === 'mobile') {
    await p.getByRole('button', { name: 'Change seats' }).click(); await p.waitForTimeout(400)
    { const z = p.getByRole('button', { name: 'Zoom in on seats' }); if (await z.count()) await z.click() } await p.waitForTimeout(300)
    info.zoomedSeatHit = Math.round(await p.locator('[role="dialog"] [data-seat]').first().evaluate((e) => e.getBoundingClientRect().width))
    await p.screenshot({ path: `${OUT}/after-zoomed-mobile.png` })
  }
  res[name] = info; await c.close()
}
console.log(tag, JSON.stringify(res)); await b.close()
