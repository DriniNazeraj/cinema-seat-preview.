// fix15.1 checks: (1) expired show -> next show + toast, party/3d kept; (2) no future shows -> movie page + toast, static curtain gone;
// (3) seat view: 180° turn -> Screen chip -> lands on yaw 0 + chip hidden (normal and reduced motion); (4) chip only when >90° (6×15° = 90° hidden, 7× shown);
// (5) chip accessible name.
import { chromium } from 'playwright'
const port = process.env.PORT ?? 4175, base = `http://localhost:${port}`
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const rows = []; const chk = (name, pass, info = '') => { rows.push(pass); console.log(pass ? 'ok  ' : 'FAIL', name, info) }
{ const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await p.goto(`${base}/movie/iron-orchard/seats?show=iron-orchard-2026-10-22-1845&party=2&3d=1`)
  const t = await p.getByText(/^That showing has ended\. Here's the next one, \w{3} \d{1,2} \w{3}, \d\d:\d\d\.$/).textContent({ timeout: 15000 }).catch(() => null)
  const u = new URL(p.url())
  chk('expired show -> next show + toast', !!t && u.searchParams.get('show') !== 'iron-orchard-2026-10-22-1845' && u.searchParams.get('party') === '2' && u.searchParams.get('3d') === '1', `${u.search} "${t}"`) }
{ const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  // a film with no shows; the prerendered static curtain is injected so we can see it is cleared on this outcome too
  await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const d = document.createElement('div'); d.id = 'seat-static'; d.style.cssText = 'position:fixed;inset:0;z-index:60;background:#7A1F2B'; d.textContent = 'Setting up the hall…'; document.body.prepend(d) }))
  await p.goto(`${base}/movie/no-such-film/seats?show=no-such-film-2026-10-22-1845&party=2`)
  const t = await p.getByText(/^That showing has ended\.$/).waitFor({ timeout: 15000 }).then(() => 1, () => 0)
  await p.waitForTimeout(500)
  const st = await p.evaluate(() => ({ path: location.pathname, overlay: !!document.getElementById('seat-static') }))
  chk('no future shows -> movie page + toast, curtain cleared', t > 0 && st.path === '/movie/no-such-film' && !st.overlay, JSON.stringify({ toast: t, ...st })) }
for (const reduced of [false, true]) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' }); const p = await c.newPage()
  await p.goto(`${base}/movie/iron-orchard/seats?show=iron-orchard-2026-10-25-1845&party=1&nofps=1&3d=1`)
  await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenDrag, null, { timeout: 180000 }); await p.waitForTimeout(2500)
  const st = () => p.evaluate(() => ({ ...window.__lumenDrag, chip: document.querySelector('[data-screen-chip]')?.dataset.screenChip, name: document.querySelector('[data-screen-chip]')?.getAttribute('aria-label') }))
  if (!reduced) {
    await p.locator('canvas').focus()
    for (let i = 0; i < 6; i++) { await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(120) }; await p.waitForTimeout(300); const s90 = await st()
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300); const s105 = await st()
    chk('chip hidden at exactly 90°, shown at 105°', s90.chip === 'hidden' && s105.chip !== 'hidden', `90°:${s90.chip} yaw ${s90.yaw?.toFixed(4)} 105°:${s105.chip} yaw ${s105.yaw?.toFixed(4)}`)
    chk('chip accessible name', s105.name === 'Turn to face the screen', s105.name)
    await p.getByRole('button', { name: 'Reset view' }).click(); await p.waitForTimeout(700)
  }
  // enter a seat view by tapping E8 (QA hook __lumenSeatXY)
  const hit = await p.evaluate(() => window.__lumenSeatXY?.('E8') ?? null)
  if (hit) await p.mouse.click(hit.x, hit.y); else await p.mouse.click(720, 560)
  await p.waitForFunction(() => document.querySelector('[data-view]')?.dataset.view !== 'overview', null, { timeout: 10000 }).catch(() => {})
  await p.waitForTimeout(800)
  const view = await p.evaluate(() => document.querySelector('[data-view]')?.dataset.view); if (view === 'overview') chk('entered seat view', false)
  const Q = Math.PI / 2 / 0.004
  for (let i = 0; i < 2; i++) { await p.mouse.move(300, 450); await p.mouse.down(); await p.mouse.move(300 + Q, 450, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(150) }
  await p.waitForTimeout(300); const s180 = await st()
  await p.locator('[data-screen-chip]').click(); await p.waitForTimeout(reduced ? 150 : 1500); const sR = await st()
  chk(`seat view ${view}${reduced ? ' (reduced motion)' : ''}: chip after 180° -> yaw 0, chip hidden`, s180.chip !== 'hidden' && sR.yaw === 0 && sR.chip === 'hidden', `before ${s180.yaw?.toFixed(3)}/${s180.chip} after ${sR.yaw}/${sR.chip}`)
}
await b.close(); const ok = rows.every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1)
