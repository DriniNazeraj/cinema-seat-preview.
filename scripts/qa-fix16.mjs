// fix16 §15.t: showtime -> "How many seats?" (phone sheet / desktop card) -> stepper -> Choose seats -> ?party=N; no popup on seats;
// deep link without party -> 2 seats + one chip pulse; chip changes the count in place.
import { chromium } from 'playwright'
const base = `http://localhost:${process.env.PORT ?? 4175}`
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const rows = []; const chk = (n, ok, d = '') => { rows.push(ok); console.log(ok ? 'ok  ' : 'FAIL', n, d) }
for (const dev of ['phone', 'desktop']) {
  const ph = dev === 'phone'
  const ctx = await b.newContext(ph ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  await p.goto(base + '/movie/iron-orchard'); await p.waitForSelector('[data-show]:not([disabled])')
  const pill = p.locator('[data-show]:not([disabled])').first(); const sid = await pill.getAttribute('data-show')
  await pill.click()
  const step = p.locator('[data-party-step]'); await step.waitFor()
  chk(`${dev}: step opens`, await step.isVisible())
  chk(`${dev}: step is ${ph ? 'dialog sheet' : 'inline (no dialog)'}`, ph ? (await step.getAttribute('role')) === 'dialog' : (await p.locator('[role=dialog]').count()) === 0)
  chk(`${dev}: default 2`, (await p.locator('[data-party-value]').innerText()).startsWith('2'))
  chk(`${dev}: group labelled`, (await p.getByRole('group', { name: 'Number of seats' }).count()) === 1)
  const plus = p.getByRole('button', { name: 'More seats' }), minus = p.getByRole('button', { name: 'Fewer seats' })
  const bx = await plus.boundingBox(); chk(`${dev}: 44px buttons`, bx.width >= 44 && bx.height >= 44, `${bx.width}x${bx.height}`)
  if (ph) {
    // focus trap: Tab many times, focus stays inside; Esc closes and returns focus to the pill
    for (let i = 0; i < 8; i++) await p.keyboard.press('Tab')
    chk('phone: focus trapped', await p.evaluate(() => !!document.activeElement?.closest('[data-party-step]')))
    await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    chk('phone: Esc closes', (await step.count()) === 0)
    chk('phone: focus back on pill', await p.evaluate((id) => document.activeElement?.getAttribute('data-show') === id, sid))
    await pill.click(); await step.waitFor()
  }
  for (let i = 0; i < 6; i++) await plus.click()
  chk(`${dev}: caps at 8`, (await p.locator('[data-party-value]').innerText()).startsWith('8') && await plus.isDisabled())
  await minus.click(); await minus.click()
  // keyboard: arrow down on a stepper button
  await minus.focus(); await p.keyboard.press('ArrowDown')
  chk(`${dev}: keyboard step + live`, (await p.locator('[data-party-value]').innerText()).startsWith('5') && (await p.locator('[data-party-value]').getAttribute('aria-live')) === 'polite')
  await p.locator('[data-choose-seats]').click()
  await p.waitForURL(/\/seats\?/)
  const u = new URL(p.url())
  chk(`${dev}: url party=5 show kept`, u.searchParams.get('party') === '5' && u.searchParams.get('show') === sid, u.search)
  await p.waitForSelector('[data-party-chip]', { timeout: 30000 })
  chk(`${dev}: chip 5 seats, no pulse`, /5 seats ▾/.test(await p.locator('[data-party-chip]').innerText()) && (await p.locator('[data-party-chip]').getAttribute('data-pulse')) === null)
  chk(`${dev}: no party popup`, (await p.getByText(/How many/).count()) === 0 && (await p.locator('input[name=party]').count()) === 0)
  // deep link, no party
  await p.goto(base + `/movie/iron-orchard/seats?show=${encodeURIComponent(sid)}`)
  await p.waitForSelector('[data-party-chip]', { timeout: 30000 })
  const chip = p.locator('[data-party-chip]')
  const anim = await chip.evaluate((e) => getComputedStyle(e).animationName)
  chk(`${dev}: deep link -> 2 seats + pulse`, /2 seats ▾/.test(await chip.innerText()) && (await chip.getAttribute('data-pulse')) === '1' && anim === 'chip-pulse', anim)
  chk(`${dev}: no popup on deep link`, (await p.getByText(/How many/).count()) === 0)
  await chip.click(); await p.locator('[data-party-chip-panel]').waitFor()
  await p.locator('[data-party-chip-panel]').getByRole('button', { name: 'More seats' }).click()
  chk(`${dev}: chip changes count in place`, /3 seats ▾/.test(await chip.innerText()) && new URL(p.url()).searchParams.get('party') === '3' && (await p.locator('canvas, [data-viewswitch]').count()) > 0)
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  chk(`${dev}: Esc closes chip panel`, (await p.locator('[data-party-chip-panel]').count()) === 0)
  await ctx.close()
}
// reduced motion: no pulse
{
  const ctx = await b.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } }); const p = await ctx.newPage()
  await p.goto(base + '/movie/iron-orchard'); await p.locator('[data-show]:not([disabled])').first().click()
  chk('reduced: sheet no animation', await p.locator('[data-party-step]').evaluate((e) => getComputedStyle(e).animationName === 'none'))
  await p.locator('[data-choose-seats]').click(); await p.waitForURL(/seats/)
  await p.goto(p.url().replace(/&party=\d/, '')); await p.waitForSelector('[data-party-chip]', { timeout: 30000 })
  chk('reduced: no chip pulse', (await p.locator('[data-party-chip]').getAttribute('data-pulse')) === null)
  await ctx.close()
}
await b.close()
console.log(rows.every(Boolean) ? `PASS ${rows.length}/${rows.length}` : `FAIL ${rows.filter((x) => !x).length} of ${rows.length}`); process.exit(rows.every(Boolean) ? 0 : 1)
