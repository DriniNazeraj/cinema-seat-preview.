import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--disable-3d-apis'] }); const p = await b.newPage(); const errs=[]
p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${process.env.PORT ?? 4173}/movie/neon-alley`)
// fix16 §15.t: showtime -> 'How many seats?' (default 2) -> Choose seats -> ?party=2; tap places the block; Change seats clears; keyboard Enter places again
await p.locator('main section button:not([disabled]):has-text("€")').first().click()
await p.locator('[data-party-step]').waitFor()
if (!(await p.locator('[data-party-value]').innerText()).startsWith('2')) throw new Error('party step default is not 2')
await p.locator('[data-choose-seats]').click(); await p.waitForURL(/seats\?.*party=2/)
if (await p.getByText(/How many/).count()) throw new Error('party popup still on the seats page')
await p.getByRole('button', { name: /Choose seats/ }).last().click().catch(() => {}) // curtain button, if still up
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
// fix17 §13.b: Tickets card on /booking (top card above guest details)
await p.getByTestId('tickets-card').waitFor()
if ((await p.getByTestId('ticket-count-adult').innerText()) !== '2') throw new Error('expected default 2 Adult tickets')
await p.getByTestId('ticket-inc-child').click()
if ((await p.getByTestId('ticket-count-adult').innerText()) !== '1' || (await p.getByTestId('ticket-count-child').innerText()) !== '1') {
  throw new Error('expected 1 Adult + 1 Child after + on Child')
}
await p.fill('input[name=name]', 'Test Person'); await p.fill('input[name=email]', 'test@example.com')
await p.getByRole('button', { name: /Confirm booking/ }).click(); await p.waitForURL(/confirmed/); await p.waitForTimeout(800)
console.log(await p.locator('h1').innerText(), await p.locator('main').innerText().then(t=>t.match(/LUM-\w+/)?.[0]), await p.getByTestId('confirmed-total').innerText(), errs)
await p.screenshot({ path: '/workspace/cinema/final/confirmed-desktop.png' }); await b.close()
