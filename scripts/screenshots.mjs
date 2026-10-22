import { chromium } from 'playwright'
const BASE = 'http://localhost:4174'
const OUT = '/workspace/cinema/final'
const errors = []
async function seatsUrl(page) {
  await page.goto(`${BASE}/movie/starlight-run`)
  await page.locator('main section button:not([disabled]):has-text("€")').first().click()
  await page.waitForURL(/seats/)
  return page.url()
}
async function pickSeat(page, label = 'Row F') {
  const free = page.locator(`[data-seat][aria-label^="${label}"][aria-label*="free"]`).nth(3)
  await free.click()
}
const gl = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
{
  const ctx = await gl.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push('console ' + m.text()))
  await page.goto(BASE + '/'); await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/home-desktop-1440.png`, fullPage: true })
  await page.goto(BASE + '/movie/starlight-run'); await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/movie-desktop-1440.png`, fullPage: true })
  const url = await seatsUrl(page)
  await page.waitForSelector('canvas', { timeout: 20000 }).catch(() => errors.push('no canvas desktop'))
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/seats-desktop-1440-overview.png` })
  await pickSeat(page)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/seats-desktop-1440-selected.png` })
  console.log('seats url', url)
  await ctx.close()
}
{
  const ctx = await gl.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('m pageerror ' + e.message))
  await page.goto(BASE + '/'); await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/home-mobile-390.png`, fullPage: true })
  await seatsUrl(page)
  await page.waitForSelector('canvas', { timeout: 20000 }).catch(() => errors.push('no canvas mobile'))
  await page.waitForTimeout(2000)
  await pickSeat(page, 'Row E')
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/seats-mobile-390-selected.png` })
  await page.screenshot({ path: `${OUT}/seats-mobile-390-selected-full.png`, fullPage: true })
  await ctx.close()
}
await gl.close()
const nogl = await chromium.launch({ args: ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] })
for (const [w, h, name] of [[1440, 900, 'desktop-1440'], [390, 844, 'mobile-390']]) {
  const ctx = await nogl.newContext({ viewport: { width: w, height: h } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push('nogl pageerror ' + e.message))
  await seatsUrl(page)
  await page.waitForTimeout(800)
  await pickSeat(page, 'Row B')
  await page.waitForTimeout(500)
  if (await page.locator('canvas').count()) errors.push('canvas present without webgl!')
  await page.screenshot({ path: `${OUT}/seats-fallback-nowebgl-${name}.png` })
  await ctx.close()
}
await nogl.close()
console.log('errors:', JSON.stringify(errors, null, 1))
