// ?3d=1 on a browser with WebGL disabled must try 3D, fail gracefully and show the fallback card (no crash).
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--disable-3d-apis', '--disable-webgl', '--disable-webgl2'] })
const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:4174/movie/starlight-run/seats?3d=1&party=1'); await p.waitForURL(/show=/); await p.waitForTimeout(4000)
const fallback = await p.locator('figure[class*="overflow-hidden"]').count(), map = await p.locator('[data-seat]').count()
console.log(fallback && map ? 'PASS' : 'FAIL', { fallback, seats: map, url: p.url(), errs })
await b.close(); process.exit(fallback && map ? 0 : 1)
