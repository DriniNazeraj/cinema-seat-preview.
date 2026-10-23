// fix15: (a) reduced motion: Back to overview is an instant cut (camera at the overview on the first sampled frame, no settling);
// (b) tapping a seat while in another seat's view flies straight to it (never passes through the overview).
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const rows = []; const chk = (n, pass, info) => { rows.push(pass); console.log(pass ? 'ok  ' : 'FAIL', n, JSON.stringify(info)) }
for (const [tag, opts, touch] of [['desktop-1440', { viewport: { width: 1440, height: 900 } }, false], ['phone-390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true]]) {
  const c = await b.newContext({ ...opts, reducedMotion: 'reduce' }), p = await c.newPage()
  await p.goto(`http://localhost:${process.env.PORT || 4175}/movie/starlight-run/seats?party=1&nofps=1&3d=1`)
  await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenDrag && window.__lumenSeatXY, null, { timeout: 90000 }); await p.waitForTimeout(2500)
  if (await p.getByRole('button', { name: 'Collapse seat picker' }).isVisible().catch(() => false)) { await p.getByRole('button', { name: 'Collapse seat picker' }).click(); await p.waitForTimeout(500) }
  const cam = () => p.evaluate(() => { const d = window.__lumenDrag; return (d.px !== undefined ? [d.px, d.py, d.pz] : [d.dx, d.dy]).map((v) => +v.toFixed(3)).join(',') /* fix14 hook has no position */ })
  const ov = await cam()
  const tapSeat = async (id) => { const xy = await p.evaluate((id) => window.__lumenSeatXY(id), id); if (!xy) return false; if (touch) await p.touchscreen.tap(xy.x, xy.y); else await p.mouse.click(xy.x, xy.y); return true }
  const view = () => p.getAttribute('[data-view]', 'data-view')
  // pick two open seats in the middle block
  const ids = ['E8', 'E9', 'F8', 'F9', 'D8', 'G8', 'D9']
  let a = null; for (const id of ids) { if (await tapSeat(id)) { await p.waitForTimeout(600); if ((await view()) === id) { a = id; break } } }
  if (!a) { chk(`${tag}-setup`, false, { note: 'could not open a seat view' }); await c.close(); continue }
  // (b) seat -> seat: tap another seat visible from a's view; data-view must go a -> b directly
  const seen = []; const stop = await p.evaluate(() => { const o = new MutationObserver(() => window.__views.push(document.querySelector('[data-view]')?.dataset.view)); window.__views = []; o.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-view'], childList: true }); return true })
  let bId = null
  for (const id of ['C8', 'C9', 'B8', 'C7', 'C10', 'B9', 'D8', 'D9', 'D7']) { if (id === a) continue; if (await tapSeat(id)) { await p.waitForTimeout(700); if ((await view()) === id) { bId = id; break } } }
  const views = await p.evaluate(() => window.__views)
  chk(`${tag}-seat-to-seat-direct`, !!bId && !views.includes('overview'), { from: a, to: bId, viewsSeen: [...new Set(views)] })
  // (a) Back under reduced motion: instant cut
  await p.locator('[data-back-overview]').click(); const t0 = Date.now(); const samples = []
  for (let i = 0; i < 20; i++) { samples.push([Date.now() - t0, await cam()]); await p.waitForTimeout(100) }
  const first = samples.findIndex(([, s]) => s === ov), settled = first >= 0 && samples.slice(first).every(([, s]) => s === ov)
  const between = samples.slice(0, Math.max(0, first)).filter(([, s]) => s !== samples[0][1]).length
  chk(`${tag}-reduced-back-instant`, settled && between === 0 && samples[first][0] < 400, { atOverviewMs: first >= 0 ? samples[first][0] : null, inBetweenFrames: between })
  await c.close()
}
const ok = rows.every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1)
