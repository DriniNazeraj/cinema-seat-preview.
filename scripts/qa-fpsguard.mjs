// §14: ?fps=slow -> quality drop, then one-time "Running slow?" toast; no auto-switch; Switch saves lumen.simple=1.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:4175/movie/starlight-run/seats?fps=slow')
const toast = await p.waitForSelector('text=Running slow? Switch to simple view', { timeout: 30000 }).then(() => true, () => false)
const still3d = await p.locator('[data-view]').count() > 0
await p.screenshot({ path: '/workspace/cinema/final/flow-shots/6-fpsguard-toast-desktop.png' })
if (toast) { await p.getByRole('button', { name: 'Switch' }).click(); await p.waitForTimeout(800) }
const r = { toast, still3dBeforeClick: still3d, simpleSaved: await p.evaluate(() => localStorage.getItem('lumen.simple')), fallbackAfter: await p.locator('figure').count() > 0, errs }
const ok = r.toast && r.still3dBeforeClick && r.simpleSaved === '1' && r.fallbackAfter && !errs.length
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(r)); await b.close(); process.exit(ok ? 0 : 1)
