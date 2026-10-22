// fix10: CPU profile of a page boot (mobile, 4x CPU); self-time by function and by source bucket
import { chromium } from 'playwright'
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }); const p = await c.newPage()
const s = await c.newCDPSession(p); await s.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', { interval: 200 }); await s.send('Profiler.start')
await p.goto('http://localhost:4175' + (process.argv[2] || '/movie/iron-orchard')); await p.waitForTimeout(2500)
const { profile } = await s.send('Profiler.stop')
const dt = {}; profile.samples.forEach((id, i) => dt[id] = (dt[id] || 0) + (profile.timeDeltas[i] || 0))
const fn = {}
for (const n of profile.nodes) { const cf = n.callFrame; if (!cf.url.includes('index-')) continue; const k = `${cf.functionName || '(anon)'}@${cf.lineNumber}:${cf.columnNumber}`; fn[k] = (fn[k] || 0) + (dt[n.id] || 0) / 1000 }
console.log(Object.entries(fn).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(1)}ms ${k}`).join('\n'))
await b.close()
