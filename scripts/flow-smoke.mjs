import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--disable-3d-apis'] }); const p = await b.newPage(); const errs=[]
p.on('pageerror', e => errs.push(e.message))
await p.goto('http://localhost:4174/movie/neon-alley')
await p.locator('main section button:not([disabled]):has-text("€")').first().click(); await p.waitForURL(/seats/)
// fix11 §15.y: step 1 'How many people?' (default 2) -> Choose seats; tap places the block; Change seats clears; keyboard Enter places again
await p.getByRole('button', { name: /Choose seats/ }).last().click()
await p.locator('[data-seat][aria-label*="free"]').nth(5).click()
await p.getByRole('button', { name: 'Change seats' }).click()
await p.locator('[data-seat][aria-label*="free"]').nth(5).press('ArrowRight')
await p.keyboard.press('Enter')
// if that run was short (Only k together), keep tapping other free seats until a full block of 2 is placed
for (let i = 10; i < 120 && await p.getByRole('button', { name: 'Continue' }).last().isDisabled(); i += 7) {
  if (!(await p.locator('[data-seat]').first().isVisible())) await p.locator('[aria-label*="Open seat picker"]').click()
  await p.locator('[data-seat][aria-label*="free"]').nth(i).click(); await p.waitForTimeout(200)
}
await p.getByRole('button', { name: 'Continue' }).last().click(); await p.waitForURL(/booking/)
await p.fill('input[name=name]', 'Test Person'); await p.fill('input[name=email]', 'test@example.com')
await p.getByRole('button', { name: /Confirm booking/ }).click(); await p.waitForURL(/confirmed/); await p.waitForTimeout(800)
console.log(await p.locator('h1').innerText(), await p.locator('main').innerText().then(t=>t.match(/LUM-\w+/)?.[0]), errs)
await p.screenshot({ path: '/workspace/cinema/final/confirmed-desktop.png' }); await b.close()
