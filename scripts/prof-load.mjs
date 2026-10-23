// fix15.1: CPU profile + long tasks of a seats load (mobile, 4x CPU). Usage: node scripts/prof-load.mjs <port> [query]
import { chromium } from 'playwright'
const port = process.argv[2] ?? 4175, qs = process.argv[3] ?? ''
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const p = await c.newPage()
await p.addInitScript(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }) })
const s = await c.newCDPSession(p); await s.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', { interval: 200 }); await s.send('Profiler.start')
await p.goto(`http://localhost:${port}/movie/iron-orchard/seats?show=iron-orchard-2026-10-25-1845${qs ? '&' + qs : ''}`); await p.waitForTimeout(7000)
const { profile } = await s.send('Profiler.stop')
const lt = await p.evaluate(() => window.__lt); console.log('LONGTASKS', JSON.stringify(lt), 'TBT', lt.reduce((a, [, d]) => a + Math.max(0, d - 50), 0))
const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n])); const dt = profile.timeDeltas
profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}:${f.columnNumber}`; self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0)) })
;[...self].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log(Math.round(v / 1000), k)); const byFile = {}; for (const [k, v] of self) { const f = k.split(" ")[1].split(":")[0]; byFile[f] = (byFile[f] ?? 0) + v } ; console.log("BYFILE", Object.entries(byFile).filter(([, v]) => v > 20000).map(([f, v]) => f + "=" + Math.round(v / 1000)).join(" "))
await b.close()
