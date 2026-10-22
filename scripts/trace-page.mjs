// fix7: devtools trace of the seats ?3d=1 load (mobile, 4x CPU, swiftshader); prints main-thread tasks >50ms with their biggest children.
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const p = await c.newPage()
const s = await c.newCDPSession(p); await s.send('Emulation.setCPUThrottlingRate', { rate: 4 })
const ev = []; s.on('Tracing.dataCollected', (d) => ev.push(...d.value))
const done = new Promise((r) => s.once('Tracing.tracingComplete', r))
await s.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8.execute', transferMode: 'ReportEvents' })
await p.goto('http://localhost:4175' + (process.argv[2] || '/movie/starlight-run/seats?3d=1')); await p.waitForTimeout(1500)
await s.send('Tracing.end'); await done
const main = ev.find((e) => e.name === 'thread_name' && e.args.name === 'CrRendererMain' && ev.some((x) => x.tid === e.tid && x.name === 'RunTask'))
const tid = main.tid, nav = ev.find((e) => e.name === 'navigationStart')?.ts ?? ev[0].ts
const tasks = ev.filter((e) => e.tid === tid && e.name === 'RunTask' && e.dur > 50000)
let max = 0
for (const t of tasks) {
  max = Math.max(max, t.dur)
  const kids = ev.filter((e) => e.tid === tid && e.ts >= t.ts && e.ts < t.ts + t.dur && e.dur > 10000 && e.name !== 'RunTask')
  const desc = kids.sort((a, b) => b.dur - a.dur).slice(0, 4).map((k) => `${k.name}${k.args?.data?.functionName ? "(" + k.args.data.functionName + ":" + (k.args.data.url||"").split("/").pop() + ":" + k.args.data.lineNumber + ")" : k.args?.data?.url ? '(' + k.args.data.url.split('/').pop() + ')' : ''} ${Math.round(k.dur / 1000)}`)
  console.log(`@${Math.round((t.ts - nav) / 1000)}ms ${Math.round(t.dur / 1000)}ms :: ${desc.join(' | ')}`)
}
console.log('MAX_TASK_MS', Math.round(max / 1000)); await b.close()
