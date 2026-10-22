import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const c = await b.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1.75 }); const p = await c.newPage()
await p.addInitScript(() => { window.__l = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__l.push([Math.round(e.startTime), e.size, e.url?.slice(-30), e.element?.tagName, (e.element?.className || '').slice(0, 60), (e.element?.textContent || '').slice(0, 30), e.element?.isConnected, Math.round(e.renderTime), Math.round(e.loadTime)]))).observe({ type: 'largest-contentful-paint', buffered: true }) })
await p.goto('http://localhost:4175' + (process.argv[2] || '/movie/starlight-run/seats?3d=1') + ''); await p.waitForTimeout(4000)
console.log(JSON.stringify(await p.evaluate(() => [window.__l, [...performance.getEntriesByType('paint'), ...performance.getEntriesByType('mark')].map((x) => x.name + ':' + Math.round(x.startTime))]), null, 0)); await b.close()
