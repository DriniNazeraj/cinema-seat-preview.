// Shots only: stretch the curtain transition to 12s (unmount waits for transitionend; 1.5s safety timer is real time, so capture at ~1.5s) so the mid-open frame can be captured (real = 900ms).
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const [name, vp] of Object.entries({ desktop: { viewport: { width: 1440, height: 900 } }, mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } })) {
  const c = await b.newContext(vp); const p = await c.newPage()
  await p.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.curtain{transition-duration:2.4s!important}'; document.head.appendChild(s) }))
  // software WebGL makes a 1440px screenshot take >1s, so the 3D chunk is blocked here: curtains open at the 2.5s cap onto the hall backdrop
  await p.route(/HallScene3D/, (r) => r.abort())
  await p.goto('http://localhost:4175/movie/starlight-run/seats?3d=1'); await p.waitForSelector('[data-curtains="opening"]', { state: 'attached', timeout: 20000 })
  await p.waitForTimeout(900); await p.screenshot({ path: `/workspace/cinema/final/flow-shots/2-curtains-mid-open-${name}.png` }); await c.close()
}
await b.close()
