// fix11/fix12 flow shots: people step, group of 4 placed (+ desktop hover preview), 'Only k together' panel, peek bar with ‹ ›.
import { chromium } from 'playwright'
const OUT = '/workspace/cinema/final/flow-shots/fix11', BASE = 'http://localhost:4175/movie/starlight-run/seats'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const files = []
const xOf = (n) => (n <= 4 ? n - 1 : n <= 12 ? n : n + 1)
async function runs(p) {
  const l = await p.$$eval('[data-seat]', (els) => els.map((e) => ({ id: e.dataset.seat, free: / free,/.test(e.getAttribute('aria-label')), acc: e.getAttribute('aria-label').includes('wheelchair') })))
  const out = []; let cur = [], prev = null
  for (const s of l.map((s) => ({ ...s, row: s.id[0], x: xOf(+s.id.slice(1)) }))) {
    const good = s.free && !s.acc, contig = prev && prev.row === s.row && prev.x === s.x - 1
    if (good && cur.length && contig) cur.push(s); else { if (cur.length) out.push(cur); cur = good ? [s] : [] }
    prev = s
  }
  if (cur.length) out.push(cur); return out
}
const shot = async (p, name) => { const f = `${OUT}/${name}.png`; await p.screenshot({ path: f }); files.push(f) }
async function ready(p) { await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length > 0, null, { timeout: 90000 }).catch(() => {}); await p.waitForTimeout(3500) }
async function openSheet(p) { if (!(await p.locator('[data-seat]').first().isVisible().catch(() => false))) { await p.locator('[aria-label*="Open seat picker"]').click(); await p.waitForTimeout(500) } }
async function place(p, id, phone) { await p.locator(`[data-seat="${id}"]`).click(); await p.waitForTimeout(500); if (phone && await p.locator(`[data-seat="${id}"]`).isVisible().catch(() => false)) { await p.locator(`[data-seat="${id}"]`).click(); await p.waitForTimeout(500) } await p.waitForTimeout(1200) }
for (const [tag, opts, phone] of [['phone-390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true], ['desktop-1440', { viewport: { width: 1440, height: 900 } }, false]]) {
  const c = await b.newContext(opts), p = await c.newPage()
  await p.goto(BASE + '?nofps=1'); await ready(p); await p.waitForSelector('[data-party-step]'); await p.locator('label:has(input[value="4"])').click(); await p.waitForTimeout(300)
  await shot(p, `1-people-step-${tag}`)
  await p.goto(BASE + '?party=4&nofps=1'); await ready(p); await p.waitForSelector('[data-seat]')
  const rs = await runs(p), long = rs.find((r) => r.length >= 6) ?? rs.find((r) => r.length >= 4), short = rs.find((r) => r.length < 4 && r.length > 1) ?? rs.find((r) => r.length < 4)
  if (!phone) { await p.locator(`[data-seat="${long[2].id}"]`).hover(); await p.waitForTimeout(400); await shot(p, `2a-hover-preview-${tag}`) }
  await place(p, long[2].id, phone); await shot(p, `2-group-of-4-placed-peek-bar-${tag}`)
  const bar = p.locator('[aria-label*="Open seat picker"]').locator('xpath=..'); await bar.screenshot({ path: `${OUT}/4-peek-bar-${tag}.png` }); files.push(`${OUT}/4-peek-bar-${tag}.png`)
  // fix12: ‹ › live in the 2D sheet footer
  await openSheet(p); await shot(p, `4b-sheet-footer-shift-buttons-${tag}`)
  await place(p, short[0].id, phone); await shot(p, `3-only-k-together-${tag}`)
  // fix12 §15.z: 3D tap = preview (party 1), view switch in the header
  await p.goto(BASE + '?party=1&nofps=1'); await ready(p)
  if (await p.getByRole('button', { name: 'Collapse seat picker' }).isVisible().catch(() => false)) { await p.getByRole('button', { name: 'Collapse seat picker' }).click(); await p.waitForTimeout(600) }
  for (const id of ['E6', 'E7', 'E10', 'F7', 'F10', 'D7']) { const xy = await p.evaluate((id) => window.__lumenSeatXY?.(id), id); if (!xy) continue; if (phone) await p.touchscreen.tap(xy.x, xy.y); else await p.mouse.click(xy.x, xy.y); await p.waitForTimeout(600); if (await p.locator('[data-previewing]').count()) break }
  await p.waitForTimeout(800); await shot(p, `5-3d-preview-peek-${tag}`)
  await p.locator('[data-viewswitch]').screenshot({ path: `${OUT}/6-view-switch-3d-${tag}.png` }); files.push(`${OUT}/6-view-switch-3d-${tag}.png`)
  await p.locator('[data-viewswitch] label:has(input[value="simple"])').click(); await p.waitForTimeout(800); await shot(p, `6b-simple-view-with-switch-${tag}`)
  await c.close()
}
console.log(files.join('\n')); await b.close()
