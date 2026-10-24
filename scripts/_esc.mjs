import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const [dev, ctxo] of [['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }], ['desktop', { viewport: { width: 1440, height: 900 } }]]) for (const where of ['stepper', 'body']) {
  const p = await (await b.newContext(ctxo)).newPage()
  await p.goto('http://localhost:4175/movie/iron-orchard/seats?show=iron-orchard-2026-10-25-1845&party=2')
  const chip = p.locator('[data-party-chip]'); await chip.waitFor({ timeout: 30000 }); await chip.click()
  await p.locator('[data-party-chip-panel]').waitFor()
  if (where === 'stepper') await p.getByRole('button', { name: 'More seats [PH]', exact: true }).focus()
  else await p.evaluate(() => { document.activeElement?.blur(); document.body.focus() })
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  const r = await p.evaluate(() => ({ panel: !!document.querySelector('[data-party-chip-panel]'), chipVisible: !!document.querySelector('[data-party-chip]'), focusChip: document.activeElement?.hasAttribute('data-party-chip') ?? false, active: document.activeElement?.tagName }))
  console.log(dev, where, JSON.stringify(r)); await p.context().close()
}
await b.close()
