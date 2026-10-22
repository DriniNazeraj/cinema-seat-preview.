// fix8 budget: total bytes over the wire for the phone seats page with 3D (fresh cache), after the hall + §15 maps are in.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const p = await c.newPage()
const s = await c.newCDPSession(p); await s.send('Network.enable'); const bytes = new Map()
s.on('Network.loadingFinished', (e) => bytes.set(e.requestId, e.encodedDataLength))
const urls = new Map(); s.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url))
await p.goto('http://localhost:4175/movie/starlight-run/seats?3d=1'); await p.waitForSelector('[role="dialog"] [data-seat]', { timeout: 30000 })
await p.waitForFunction(() => performance.getEntriesByName('lumen:hall-normal-applied').length > 0, null, { timeout: 15000 }).catch(() => console.log('maps not applied!'))
await p.waitForTimeout(1500)
let tot = 0; const rows = []
for (const [id, n] of bytes) { tot += n; rows.push([n, (urls.get(id) || id).replace('http://localhost:4175', '').slice(0, 70)]) }
rows.sort((a, b) => b[0] - a[0]); console.log(rows.slice(0, 8).map(([n, u]) => (n / 1024).toFixed(1) + ' KB ' + u).join('\n'))
console.log('TOTAL_KB', (tot / 1024).toFixed(1), 'marks', JSON.stringify(await p.evaluate(() => performance.getEntriesByType('mark').map((m) => m.name.slice(6) + ':' + Math.round(m.startTime)))))
await b.close()
