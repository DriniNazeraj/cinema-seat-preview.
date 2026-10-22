// QA: pick C15, C16, unpick C16 -> camera must stay on C15 (not Overview); unpick C15 -> Overview.
import { chromium } from 'playwright'
const BASE = 'http://localhost:4174'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto(BASE + '/movie/starlight-run')
const pills = p.locator('main section button:not([disabled]):has-text("€")')
let ok = false
for (let i = 0; i < (await pills.count()) && !ok; i++) {
  await p.goto(BASE + '/movie/starlight-run'); await pills.nth(i).click(); await p.waitForURL(/seats/)
  await p.waitForSelector('[data-seat="C15"]')
  ok = (await p.getAttribute('[data-seat="C15"]', 'aria-label')).includes('free') && (await p.getAttribute('[data-seat="C16"]', 'aria-label')).includes('free')
}
if (!ok) throw new Error('no show with C15+C16 free')
const url = new URL(p.url()); url.searchParams.set('3d', '1'); await p.goto(url.href)
await p.waitForSelector('[data-view]', { timeout: 20000 })
const view = () => p.getAttribute('[data-view]', 'data-view')
const fail = []
await p.click('[data-seat="C15"]'); await p.waitForTimeout(300); if (await view() !== 'C15') fail.push('after C15: ' + await view())
await p.click('[data-seat="C16"]'); await p.waitForTimeout(300); if (await view() !== 'C16') fail.push('after C16: ' + await view())
await p.click('[data-seat="C16"]'); await p.waitForTimeout(1200); if (await view() !== 'C15') fail.push('after unpick C16: ' + await view())
await p.screenshot({ path: '/workspace/cinema/final/qa-unpick-c16-stays-c15.png' })
await p.click('[data-seat="C15"]'); await p.waitForTimeout(300); if (await view() !== 'overview') fail.push('after unpick C15: ' + await view())
await b.close()
console.log(fail.length ? 'FAIL ' + fail.join('; ') : 'PASS unpick keeps camera on last still-selected seat')
process.exit(fail.length ? 1 : 0)
