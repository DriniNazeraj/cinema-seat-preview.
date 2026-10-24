// fix15 screenshots: overview turned 180° with Screen chip, after Reset, phone corner seat view
import { chromium } from 'playwright'
const OUT = '/workspace/cinema/final/flow-shots/fix15'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const [tag, opts, touch] of [['desktop-1440', { viewport: { width: 1440, height: 900 } }, false], ['phone-390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]]) {
  const p = await (await b.newContext({ ...opts, reducedMotion: 'reduce' })).newPage()
  await p.goto('http://localhost:4175/movie/starlight-run/seats?party=1&nofps=1')
  await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenSeatXY, null, { timeout: 90000 }); await p.waitForTimeout(2000)
  if (touch) { await p.getByRole('button', { name: 'Collapse seat picker' }).click().catch(() => {}); await p.waitForTimeout(1500) }
  await p.focus('canvas[tabindex="0"]')
  for (let i = 0; i < 12; i++) { await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150) }
  await p.waitForSelector('[data-screen-chip]:not([data-screen-chip="hidden"])', { timeout: 20000 }).catch(() => console.log(tag, 'chip not seen'))
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${tag}-1-turned-180-screen-chip.png` })
  await p.locator('[data-screen-chip]').click({ timeout: 10000 }).catch(() => p.getByRole('button', { name: 'Reset view' }).click()); await p.waitForTimeout(2000)
  await p.screenshot({ path: `${OUT}/${tag}-2-after-reset.png` })
  if (touch) {
    for (const id of ['A1', 'J16', 'A16', 'J1']) {
      const W = 390, H = 844, bad = (q) => !q || q.x < 16 || q.x > W - 16 || q.y < 58 || q.y > H - 66
      let q = await p.evaluate((id) => window.__lumenSeatXY(id), id)
      for (const dx of [160, -160]) { if (!bad(q)) break
        await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, 400); await p.waitForTimeout(300)
        await p.mouse.move(W / 2, 400); await p.mouse.down(); await p.mouse.move(W / 2 + dx, 330, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(1500)
        q = await p.evaluate((id) => window.__lumenSeatXY(id), id) }
      if (bad(q)) continue
      await p.touchscreen.tap(q.x, q.y); await p.waitForTimeout(2500)
      await p.screenshot({ path: `${OUT}/${tag}-3-corner-seatview-${id}.png` }); console.log(tag, 'corner', id, await p.getAttribute('[data-view]', 'data-view')); break
    }
  }
}
await b.close()
