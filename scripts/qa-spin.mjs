// fix15 §15.u rev 3: full spin. A 360° drag returns to the same view; Reset after 270° turns the short way (≤180°, here 90°);
// the Screen chip shows when the screen is >90° off-centre and hides after Reset; ← turns 15°.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await p.goto('http://localhost:4175/movie/starlight-run/seats?party=1&nofps=1&3d=1')
await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-ready').length && window.__lumenDrag, null, { timeout: 90000 }); await p.waitForTimeout(2500)
const st = () => p.evaluate(() => ({ ...window.__lumenDrag, chip: document.querySelector('[data-screen-chip]')?.dataset.screenChip }))
const QUARTER = Math.PI / 2 / 0.004 // px per 90°
const turn = async (n) => { for (let i = 0; i < n; i++) { await p.mouse.move(300, 450); await p.mouse.down(); await p.mouse.move(300 + QUARTER, 450, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(150) } }
const rows = []; const chk = (name, pass, info) => { rows.push(pass); console.log(pass ? 'ok  ' : 'FAIL', name, info) }
const s0 = await st()
await turn(2); await p.waitForTimeout(300); const s180 = await st()
chk('180° turn shows Screen chip', !!s180.chip && s180.chip !== 'hidden', `yaw ${s180.yaw.toFixed(3)} chip ${s180.chip}`)
await turn(2); await p.waitForTimeout(300); const s360 = await st()
const dd = Math.hypot(s360.dx - s0.dx, s360.dy - s0.dy, s360.dz - s0.dz)
chk('360° drag returns to same view', dd < 1e-3 && s360.chip === 'hidden', `yaw ${s360.yaw.toFixed(3)} Δdir ${dd.toExponential(1)} chip ${s360.chip}`)
await p.getByRole('button', { name: 'Reset view' }).click(); await p.waitForTimeout(700)
await turn(3); await p.waitForTimeout(300); const s270 = await st()
const ys = []; await p.getByRole('button', { name: 'Reset view' }).click()
for (let i = 0; i < 60; i++) { ys.push((await st()).yaw); await p.waitForTimeout(40) }
const glide = ys.filter((y) => Math.abs(y - s270.yaw) > 1e-6) // after go() normalised the yaw (React effect lands a frame later)
await p.waitForTimeout(500); const sR = await st()
const maxAbs = Math.max(...glide.map(Math.abs))
chk('Reset after 270° turns the short way', maxAbs <= Math.PI / 2 + 0.02 && Math.abs(sR.yaw) < 1e-3 && sR.chip === 'hidden', `yaw before ${s270.yaw.toFixed(3)}, max |yaw| in glide ${maxAbs.toFixed(3)} (≤ π/2), end ${sR.yaw.toFixed(4)}`)
await p.waitForTimeout(1500); await p.locator('canvas[tabindex="0"]').first().focus(); const act = await p.evaluate(() => document.activeElement?.tagName); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(1200); const sK = await st()
chk('← turns 15°', Math.abs(sK.yaw - Math.PI / 12) < 1e-3, `yaw ${sK.yaw.toFixed(4)} focus ${act}`)
await p.mouse.move(720, 450); await p.mouse.wheel(0, 2000); await p.waitForTimeout(200); const z1 = (await st()).zoom
await p.mouse.wheel(0, -4000); await p.waitForTimeout(200); const z2 = (await st()).zoom
chk('wheel zoom clamps 0.75–1.25×', Math.abs(z1 - 1.25) < 1e-6 && Math.abs(z2 - 0.75) < 1e-6, `${z1} / ${z2}`)
const ok = rows.every(Boolean); console.log(ok ? 'PASS' : 'FAIL'); await b.close(); process.exit(ok ? 0 : 1)
