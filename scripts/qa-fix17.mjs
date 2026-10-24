import { chromium } from 'playwright'

const BASE = `http://localhost:${process.env.PORT || 4173}`
const log = []
const check = (name, ok, detail = '') => {
  log.push({ name, ok: !!ok, detail })
  if (!ok) console.error('FAIL:', name, detail)
}

async function pickFreeGroup(p) {
  await p.locator('[data-seat]').first().waitFor({ state: 'visible' })
  const freeSeats = p.locator('button[data-seat]:not([aria-disabled="true"])')
  const count = await freeSeats.count()
  for (let i = 0; i < count; i++) {
    const id = await freeSeats.nth(i).getAttribute('data-seat')
    if (id?.startsWith('J')) continue
    await freeSeats.nth(i).click()
    await p.waitForTimeout(100)
    if (!(await p.getByRole('button', { name: 'Continue' }).isDisabled())) return
  }
}

const b = await chromium.launch()

try {
  // 1. Desktop flow: 2 standard seats -> /booking -> Tickets card above guest form -> stepper coupling -> Child-only guard -> 1 Adult + 1 Child (€20) -> Confirmed
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    const errs = []
    p.on('pageerror', (e) => errs.push(e.message))

    await p.goto(`${BASE}/movie/iron-orchard/seats?party=2&2d=1`, { waitUntil: 'networkidle' })
    await pickFreeGroup(p)
    await p.getByRole('button', { name: 'Continue' }).click()
    await p.waitForURL('**/booking')

    // Step indicator shows "Tickets & Details"
    const stepText = await p.locator('[aria-label="Booking steps"]').textContent()
    check('StepIndicator shows Tickets & Details', stepText?.includes('Tickets & Details'), stepText || '')

    // Tickets card is present and positioned above "Your details"
    const ticketsCard = p.getByTestId('tickets-card')
    await ticketsCard.waitFor({ state: 'visible' })
    const ticketsBox = await ticketsCard.boundingBox()
    const detailsHeading = p.getByRole('heading', { name: 'Your details' })
    const detailsBox = await detailsHeading.boundingBox()
    check('Tickets card is above Guest Details card', (ticketsBox?.y ?? 9999) < (detailsBox?.y ?? 0), `tickets.y=${ticketsBox?.y} details.y=${detailsBox?.y}`)

    // Caption shows "2 seats held — adjust ticket types below"
    const caption = await p.getByTestId('tickets-caption').textContent()
    check('Tickets caption shows 2 seats held', caption?.includes('2 seats held — adjust ticket types below'), caption || '')

    // Default: 2 Adult (€12), 0 Child (€8), total €24
    check('Default adult count is 2', (await p.getByTestId('ticket-count-adult').textContent()) === '2')
    check('Default child count is 0', (await p.getByTestId('ticket-count-child').textContent()) === '0')
    check('Adult + button disabled at m=2', await p.getByTestId('ticket-inc-adult').isDisabled())
    check('Child - button disabled at 0', await p.getByTestId('ticket-dec-child').isDisabled())
    check('Default summary total is €24', (await p.getByTestId('summary-total-value').textContent())?.includes('€24'))

    // Tap + on Child -> 1 Adult + 1 Child, total €20
    await p.getByTestId('ticket-inc-child').click()
    check('Coupled stepper: adult=1 after child +', (await p.getByTestId('ticket-count-adult').textContent()) === '1')
    check('Coupled stepper: child=1 after child +', (await p.getByTestId('ticket-count-child').textContent()) === '1')
    check('Live total updates to €20', (await p.getByTestId('summary-total-value').textContent())?.includes('€20'))
    check('Confirm CTA shows €20', (await p.getByTestId('confirm-booking-btn').textContent())?.includes('€20'))

    // Tap + on Child again -> 0 Adult + 2 Child -> CHILD_ONLY_BOOKING inline error + disabled Confirm CTA
    await p.getByTestId('ticket-inc-child').click()
    check('Coupled stepper: adult=0, child=2', (await p.getByTestId('ticket-count-adult').textContent()) === '0' && (await p.getByTestId('ticket-count-child').textContent()) === '2')
    const errText = await p.getByTestId('ticket-error').textContent()
    check('Child-only inline error shown', errText?.includes('Children need an adult or Disability ticket with them'), errText || '')
    check('Confirm CTA disabled on child-only selection', await p.getByTestId('confirm-booking-btn').isDisabled())

    // Tap + on Adult -> back to 1 Adult + 1 Child -> error clears, Confirm enabled
    await p.getByTestId('ticket-inc-adult').click()
    check('Error clears when 1 Adult restored', (await p.getByTestId('ticket-error').count()) === 0)
    check('Confirm CTA enabled when 1 Adult + 1 Child', !(await p.getByTestId('confirm-booking-btn').isDisabled()))

    // Submit booking -> Confirmed page shows itemized breakdown & €20 total
    await p.getByLabel('Full name').fill('Ada Lovelace')
    await p.getByLabel('Email').fill('ada@example.com')
    await p.getByTestId('confirm-booking-btn').click()
    await p.waitForURL('**/booking/confirmed**')

    const confTickets = await p.getByTestId('confirmed-tickets').textContent()
    const confTotal = await p.getByTestId('confirmed-total').textContent()
    check('Confirmed page shows itemized Adult & Child lines', confTickets?.includes('1 × Adult') && confTickets?.includes('1 × Child (under 12)'), confTickets || '')
    check('Confirmed page shows €20 total', confTotal?.includes('€20'), confTotal || '')
    check('Zero page errors on standard flow', errs.length === 0, errs.join('; '))
    await ctx.close()
  }

  // 2. Access seat (J1/J2/J15/J16) + 1 standard seat -> locked to Disability (€8) + 1 Child (€8) -> valid (Disability counts as adult!) -> €16 total
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()

    await p.goto(`${BASE}/movie/iron-orchard/seats?party=2&2d=1`, { waitUntil: 'networkidle' })
    await p.locator('[data-seat]').first().waitFor({ state: 'visible' })
    const freeAccess = p.locator('button[data-seat="J1"]:not([aria-disabled="true"]), button[data-seat="J2"]:not([aria-disabled="true"]), button[data-seat="J15"]:not([aria-disabled="true"]), button[data-seat="J16"]:not([aria-disabled="true"])').first()
    const accessId = await freeAccess.getAttribute('data-seat')
    const freeStd = p.locator('button[data-seat^="A"]:not([aria-disabled="true"]), button[data-seat^="B"]:not([aria-disabled="true"]), button[data-seat^="C"]:not([aria-disabled="true"])').first()
    const stdId = await freeStd.getAttribute('data-seat')

    // Click wheelchair access seat -> shows "Split the group" -> enter split mode -> pick access seat + 1 standard seat
    await freeAccess.click()
    await p.getByRole('button', { name: /Split the group/ }).click()
    await freeAccess.click()
    await freeStd.click()
    await p.getByRole('button', { name: 'Continue' }).click()
    await p.waitForURL('**/booking')

    // Locked Disability row for accessId
    const lockedRow = p.getByTestId(`ticket-locked-${accessId}`)
    await lockedRow.waitFor({ state: 'visible' })
    const lockedText = await lockedRow.textContent()
    const lockedAria = await lockedRow.getAttribute('aria-label')
    check('Locked Disability row rendered for access seat', lockedText?.includes(`Seat ${accessId}`) && lockedText?.includes('Disability') && lockedText?.includes('€8') && lockedText?.includes('Locked'), lockedText || '')
    check('Locked Disability row aria-label matches §13.b', lockedAria === `Seat ${accessId} (Wheelchair space) · Disability · €8 [PH]`, lockedAria || '')

    // Remaining m=1 standard seat defaults to 1 Adult, 0 Child -> total €8 + €12 = €20
    check('Standard pool m=1 defaults to 1 Adult', (await p.getByTestId('ticket-count-adult').textContent()) === '1')
    check('Total with Disability + 1 Adult is €20', (await p.getByTestId('summary-total-value').textContent())?.includes('€20'))

    // Switch the 1 standard seat to Child -> 1 Disability + 0 Adult + 1 Child -> valid because Disability counts as an adult!
    await p.getByTestId('ticket-inc-child').click()
    check('Standard seat switched to 1 Child (0 Adult)', (await p.getByTestId('ticket-count-adult').textContent()) === '0' && (await p.getByTestId('ticket-count-child').textContent()) === '1')
    check('No child-only error when Disability ticket is present', (await p.getByTestId('ticket-error').count()) === 0)
    check('Confirm CTA stays enabled with 1 Disability + 1 Child', !(await p.getByTestId('confirm-booking-btn').isDisabled()))
    check('Total with 1 Disability (€8) + 1 Child (€8) is €16', (await p.getByTestId('summary-total-value').textContent())?.includes('€16'))

    await p.getByLabel('Full name').fill('Grace Hopper')
    await p.getByLabel('Email').fill('grace@example.com')
    await p.getByTestId('confirm-booking-btn').click()
    await p.waitForURL('**/booking/confirmed**')

    const confTickets = await p.getByTestId('confirmed-tickets').textContent()
    const confTotal = await p.getByTestId('confirmed-total').textContent()
    check('Confirmed page shows 1 × Child (under 12) and 1 × Disability', confTickets?.includes('1 × Child (under 12)') && confTickets?.includes('1 × Disability'), confTickets || '')
    check('Confirmed page total is €16', confTotal?.includes('€16'), confTotal || '')
    await ctx.close()
  }

  // 3. Companion seat (J3/J14) + Access seat (J1/J2/J15/J16) + Standard seat: access seat locks to 'disabled', companion & standard go into m=2 Adult/Child pool in hold order
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()

    await p.goto(`${BASE}/movie/iron-orchard/seats?party=3&2d=1`, { waitUntil: 'networkidle' })
    await p.locator('[data-seat]').first().waitFor({ state: 'visible' })
    const freeAccess = p.locator('button[data-seat="J1"]:not([aria-disabled="true"]), button[data-seat="J2"]:not([aria-disabled="true"]), button[data-seat="J15"]:not([aria-disabled="true"]), button[data-seat="J16"]:not([aria-disabled="true"])').first()
    const accessId = await freeAccess.getAttribute('data-seat')
    const freeComp = p.locator('button[data-seat="J3"]:not([aria-disabled="true"]), button[data-seat="J14"]:not([aria-disabled="true"])').first()
    const compId = await freeComp.getAttribute('data-seat')
    const freeStd = p.locator('button[data-seat^="A"]:not([aria-disabled="true"]), button[data-seat^="B"]:not([aria-disabled="true"]), button[data-seat^="C"]:not([aria-disabled="true"])').first()
    const stdId = await freeStd.getAttribute('data-seat')

    // Click access seat -> enter split mode -> pick access seat, then companion seat, then standard seat
    await freeAccess.click()
    await p.getByRole('button', { name: /Split the group/ }).click()
    await freeAccess.click()
    await freeComp.click()
    await freeStd.click()
    await p.getByRole('button', { name: 'Continue' }).click()
    await p.waitForURL('**/booking')

    await p.getByTestId(`ticket-locked-${accessId}`).waitFor({ state: 'visible' })
    check('Only access seat has a locked Disability row (companion seat does not)', (await p.getByTestId(`ticket-locked-${accessId}`).count()) === 1 && (await p.getByTestId(`ticket-locked-${compId}`).count()) === 0)
    check('Companion seat + standard seat form m=2 standard pool (default 2 Adult)', (await p.getByTestId('ticket-count-adult').textContent()) === '2')

    // Adjust to 1 Adult + 1 Child -> in hold order [accessId, compId, stdId]: accessId='disabled', compId='adult', stdId='child'
    await p.getByTestId('ticket-inc-child').click()
    const chipAcc = await p.getByTestId(`summary-seat-${accessId}`).textContent()
    const chipComp = await p.getByTestId(`summary-seat-${compId}`).textContent()
    const chipStd = await p.getByTestId(`summary-seat-${stdId}`).textContent()
    check('Hold order assignment: access seat is Disability', chipAcc?.includes(`${accessId} · Disability`), chipAcc || '')
    check('Hold order assignment: first standard seat (companion) is Adult', chipComp?.includes(`${compId} · Adult`), chipComp || '')
    check('Hold order assignment: second standard seat is Child', chipStd?.includes(`${stdId} · Child`), chipStd || '')
    check('Total for 1 Disability (€8) + 1 Adult (€12) + 1 Child (€8) is €28', (await p.getByTestId('summary-total-value').textContent())?.includes('€28'))

    await p.getByLabel('Full name').fill('Alan Turing')
    await p.getByLabel('Email').fill('alan@example.com')
    await p.getByTestId('confirm-booking-btn').click()
    await p.waitForURL('**/booking/confirmed**')
    const ref = new URL(p.url()).searchParams.get('ref')
    const saved = await p.evaluate((r) => JSON.parse(sessionStorage.getItem('lumen.bookings') || '{}')[r], ref)
    const confirmedTickets = saved?.tickets ?? []
    check(
      'Confirmed booking tickets array matches hold order [access:disabled, companion:adult, standard:child]',
      JSON.stringify(confirmedTickets.map((t) => [t.seatId, t.ticketType])) === JSON.stringify([[accessId, 'disabled'], [compId, 'adult'], [stdId, 'child']]),
      JSON.stringify(confirmedTickets),
    )
    await ctx.close()
  }

  // 4. Mobile 390px layout check on /booking
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
    const p = await ctx.newPage()
    await p.goto(`${BASE}/movie/iron-orchard/seats?party=2&2d=1`, { waitUntil: 'networkidle' })
    await p.locator('[data-seat]').first().waitFor({ state: 'visible' })
    const zoomBtn = p.getByRole('button', { name: 'Zoom in on seats' })
    if (await zoomBtn.isVisible()) await zoomBtn.click()
    await pickFreeGroup(p)
    await p.getByRole('button', { name: 'Continue' }).click()
    await p.waitForURL('**/booking')

    await p.getByTestId('tickets-card').waitFor({ state: 'visible' })
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    check('390px mobile /booking has no horizontal overflow', !overflow)
    await ctx.close()
  }
} finally {
  await b.close()
}

const failed = log.filter((x) => !x.ok)
console.log(`\n=== QA fix17 (§13.b Tickets after Seats): ${log.length - failed.length}/${log.length} passed ===`)
for (const r of log) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
if (failed.length) process.exit(1)
