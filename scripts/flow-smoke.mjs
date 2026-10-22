import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--disable-3d-apis'] }); const p = await b.newPage(); const errs=[]
p.on('pageerror', e => errs.push(e.message))
await p.goto('http://localhost:4174/movie/neon-alley')
await p.locator('main section button:not([disabled]):has-text("€")').first().click(); await p.waitForURL(/seats/)
await p.locator('[data-seat][aria-label*="free"]').nth(5).click()
// fix6: simple view collapses to the peek bar after a pick (same as 3D); reopen it
await p.getByRole('button', { name: 'Change seats' }).click()
await p.locator('[data-seat][aria-label*="free"]').nth(5).press('ArrowRight')
await p.keyboard.press('Enter')
await p.getByRole('button', { name: 'Continue' }).last().click(); await p.waitForURL(/booking/)
await p.fill('input[name=name]', 'Test Person'); await p.fill('input[name=email]', 'test@example.com')
await p.getByRole('button', { name: /Confirm booking/ }).click(); await p.waitForURL(/confirmed/); await p.waitForTimeout(800)
console.log(await p.locator('h1').innerText(), await p.locator('main').innerText().then(t=>t.match(/LUM-\w+/)?.[0]), errs)
await p.screenshot({ path: '/workspace/cinema/final/confirmed-desktop.png' }); await b.close()
