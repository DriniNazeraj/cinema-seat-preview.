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
  const plus = p.getByRole('button', { name: 'More seats [PH]', exact: true }), minus = p.getByRole('button', { name: 'Fewer seats [PH]', exact: true })
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
  // fix16.1 draft: +/- change only the draft; Esc cancels (focus on a stepper button, then focus on body); Done applies
  const cpanel = p.locator('[data-party-chip-panel]')
  const sheetUp = () => p.evaluate(() => !!document.querySelector('[data-party-chip]'))
  for (const where of ['stepper', 'body']) {
    await chip.click(); await cpanel.waitFor()
    await cpanel.getByRole('button', { name: 'More seats [PH]', exact: true }).click()
    const draftOnly = /2 seats ▾/.test(await chip.innerText()) && new URL(p.url()).searchParams.get('party') === null
    if (where === 'body') await p.evaluate(() => { document.activeElement?.blur() })
    await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    chk(`${dev}: Esc (${where}) cancels draft, closes panel, focus chip, sheet open`, draftOnly && (await cpanel.count()) === 0 && await sheetUp() &&
      /2 seats ▾/.test(await chip.innerText()) && await p.evaluate(() => document.activeElement?.hasAttribute('data-party-chip')))
  }
  await chip.click(); await cpanel.waitFor(); await cpanel.getByRole('button', { name: 'More seats [PH]', exact: true }).click()
  await cpanel.locator('[data-party-done]').click(); await p.waitForTimeout(200)
  chk(`${dev}: Done applies the draft in place`, /3 seats ▾/.test(await chip.innerText()) && new URL(p.url()).searchParams.get('party') === '3' && (await cpanel.count()) === 0 && (await p.locator('canvas, [data-viewswitch]').count()) > 0)
  // fix16.1: chip keeps picks. party 5 (simple view) -> place a group -> 5 down to 3 keeps the first 3 -> back up to 5 keeps all 3
  await p.goto(base + `/movie/iron-orchard/seats?show=${encodeURIComponent(sid)}&party=5&simple=1`)
  await p.waitForSelector('[data-party-chip]', { timeout: 30000 })
  const cart = () => p.evaluate(() => JSON.parse(sessionStorage.getItem('lumen.cart') ?? '{}'))
  for (let i = 0; i < 40 && (await cart()).seats?.length !== 5; i++) { await p.locator('[data-seat][aria-label*="free"]').nth(i * 3).click(); await p.waitForTimeout(250) }
  const five = (await cart()).seats ?? []
  chk(`${dev}: placed 5`, five.length === 5, five.join(','))
  const c2 = p.locator('[data-party-chip]')
  if (!(await c2.isVisible())) await p.locator('[aria-label*="Open seat picker"]').click()
  await c2.click()
  const panel = p.locator('[data-party-chip-panel]')
  await panel.getByRole('button', { name: 'Fewer seats [PH]', exact: true }).click(); await panel.getByRole('button', { name: 'Fewer seats [PH]', exact: true }).click(); await p.waitForTimeout(200)
  chk(`${dev}: draft does not touch picks`, JSON.stringify((await cart()).seats) === JSON.stringify(five) && new URL(p.url()).searchParams.get('party') === '5')
  await panel.locator('[data-party-done]').click(); await p.waitForTimeout(200)
  const three = (await cart()).seats ?? [], say = await p.locator('[data-say]').innerText()
  chk(`${dev}: 5 -> 3 keeps first 3 in pick order`, JSON.stringify(three) === JSON.stringify(five.slice(0, 3)) && /3 seats ▾/.test(await c2.innerText()), three.join(','))
  chk(`${dev}: url party=3 + polite announcement`, new URL(p.url()).searchParams.get('party') === '3' && (await p.locator('[data-say]').getAttribute('aria-live')) === 'polite' && /3 seats, removed A\w+, A\w+, 3 of 3 picked/.test(say), say)
  await c2.click(); await panel.waitFor()
  await panel.getByRole('button', { name: 'More seats [PH]', exact: true }).click(); await panel.getByRole('button', { name: 'More seats [PH]', exact: true }).click()
  await panel.locator('[data-party-done]').click(); await p.waitForTimeout(200)
  const up = (await cart()).seats ?? []
  chk(`${dev}: 3 -> 5 keeps every pick`, JSON.stringify(up) === JSON.stringify(three) && new URL(p.url()).searchParams.get('party') === '5' && /3 of 5 picked/.test(await p.locator('[data-say]').innerText()), up.join(','))
  chk(`${dev}: no hold left on dropped seats`, !(await cart()).holdId)
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
