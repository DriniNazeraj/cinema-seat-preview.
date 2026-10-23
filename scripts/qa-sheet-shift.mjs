import { chromium } from 'playwright'
const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await c.newPage(); await p.goto('http://localhost:'+process.argv[2]+'/movie/iron-orchard/seats?show=iron-orchard-2026-10-25-1845&party=2')
for (let i = 0; i < 30; i++) { const h = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d ? Math.round(d.getBoundingClientRect().top) + ' ' + d.textContent.slice(0, 60) : '-' }); console.log(i*100, h); await p.waitForTimeout(100) }
await b.close()
