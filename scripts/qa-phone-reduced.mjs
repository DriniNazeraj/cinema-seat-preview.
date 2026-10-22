import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const rm of ['reduce','no-preference']) for (const q of ['3d=1','nofps=1']) {
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, reducedMotion: rm }); const p = await c.newPage()
await p.goto('http://localhost:4175/movie/starlight-run/seats?'+q); const seen = await p.waitForSelector('[data-curtains]', { state: 'attached', timeout: 3000 }).then(() => true, () => false)
await p.waitForTimeout(3000)
console.log(rm, q, 'curtainsShown', seen, JSON.stringify(await p.evaluate(() => [performance.getEntriesByType('mark').map(m => m.name + ':' + Math.round(m.startTime)), document.querySelector('p[role=status]')?.innerText])))
await c.close() }
await b.close()
