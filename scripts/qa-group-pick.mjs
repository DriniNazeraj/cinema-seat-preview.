// fix11 / DESIGN §15.y rev 3 + 3.1: group seat picking. Runs on the prod build (simple 2D view so seats are DOM buttons).
import { chromium } from 'playwright'
const URL = 'http://localhost:4175/movie/starlight-run/seats?simple=1'
const b = await chromium.launch(); const R = {}; let ok = true
const check = (k, cond, info) => { R[k] = { pass: !!cond, ...(info ?? {}) }; ok &&= !!cond }
const xOf = (n) => (n <= 4 ? n - 1 : n <= 12 ? n : n + 1)
async function seats(p) {
  return p.$$eval('[data-seat]', (els) => els.map((e) => ({ id: e.dataset.seat, label: e.getAttribute('aria-label') })))
    .then((l) => l.map((s) => ({ ...s, row: s.id[0], n: +s.id.slice(1), free: / free,/.test(s.label), sel: / selected,/.test(s.label), access: s.label.includes('wheelchair') })).map((s) => ({ ...s, x: xOf(s.n) })))
}
function runs(list) { // free non-access contiguous runs per row
  const out = []
  for (const row of [...new Set(list.map((s) => s.row))]) {
    let cur = []
    const r = list.filter((s) => s.row === row).sort((a, b) => a.x - b.x)
    r.forEach((s, i) => { const ok = s.free && !s.access, contig = i && r[i - 1].x === s.x - 1; if (ok && cur.length && contig) cur.push(s); else { if (cur.length) out.push(cur); cur = ok ? [s] : [] } })
    if (cur.length) out.push(cur)
  }
  return out
}
async function openSheet(p) { if (!(await p.locator('[data-seat]').first().isVisible().catch(() => false))) { await p.locator('[aria-label*="Open seat picker"]').click(); await p.waitForTimeout(400) } }
const sel = async (p) => { await openSheet(p); return (await seats(p)).filter((s) => s.sel).map((s) => s.id) }
const _sel0 = async (p) => (await seats(p)).filter((s) => s.sel).map((s) => s.id)
async function closeSheet(p) { const x = p.locator('[aria-label*="Collapse seat picker"]'); if (await x.isVisible().catch(() => false)) { await x.click(); await p.waitForTimeout(300) } }
const card = async (p) => { await closeSheet(p); return p.locator('[aria-label*="Open seat picker"]').getAttribute('aria-label') }
const say = (p) => p.locator('[data-say]').textContent()
async function tap(p, id) { await openSheet(p); await p.locator(`[data-seat="${id}"]`).click(); await p.waitForTimeout(300) }

const c = await b.newContext({ viewport: { width: 1280, height: 860 } }), p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto(URL); await p.waitForSelector('[data-party-step]')
const radios = p.locator('input[type=radio][name=party]')
check('step1-native-radio-1to8-default2', (await radios.count()) === 8 && (await p.locator('input[name=party]:checked').getAttribute('value')) === '2')
await p.locator('label:has(input[value="4"])').click(); await p.getByRole('button', { name: /Choose seats/ }).click(); await p.waitForSelector('[data-seat]')
check('chip-shows-4-people', /4 people/.test(await p.locator('[data-party-chip]').textContent()))
let all = await seats(p), rs = runs(all)
// 1) interior tap, centred block of 4 incl. tapped
const long = rs.find((r) => r.length >= 6) ?? rs.find((r) => r.length >= 4)
const mid = long[Math.floor(long.length / 2)]
await tap(p, mid.id); let s = await sel(p)
check('tap-places-4-incl-tapped', s.length === 4 && s.includes(mid.id), { tapped: mid.id, s, card: await card(p), say: await say(p) })
check('aria-live-announces-range', /to .* selected, 4 seats/.test(await say(p)))
check('card-range-and-count', /· 4 seats/.test(await card(p)))
// 2) tap inside the group = no change
const before = s; await tap(p, s[0]); s = await sel(p); check('tap-within-group-noop', JSON.stringify(s) === JSON.stringify(before))
// 3) shift with ] and ‹ ›
await openSheet(p); const rightBtn = p.locator('[data-shift="1"]'); await closeSheet(p); await p.waitForTimeout(300)
const canR = await rightBtn.isEnabled(), canL = await p.locator('[data-shift="-1"]').isEnabled()
if (canR) { await rightBtn.click(); const s2 = await sel(p); check('shift-right-by-one', s2.length === 4 && !s2.includes(before.sort((a, b) => xOf(+a.slice(1)) - xOf(+b.slice(1)))[0]), { s2 }) }
else check('shift-right-disabled-at-edge', true)
await openSheet(p); const g0 = await sel(p); await p.locator(`[data-seat="${g0[0]}"]`).focus(); await p.keyboard.press(canL ? '[' : ']'); await p.waitForTimeout(200)
check('keyboard-bracket-shifts', JSON.stringify(await sel(p)) !== JSON.stringify(g0), { from: g0, to: await sel(p) })
// 4) row end: tap first seat of a run that starts at the row start -> block slides inward
all = await seats(p); rs = runs(all.map((x) => ({ ...x, free: x.free || x.sel })))
const atStart = rs.find((r) => r.length >= 4 && r[0].n === 1) ?? rs.find((r) => r.length >= 4)
await tap(p, atStart[0].id); s = await sel(p)
check('row-end-slides-inward', s.length === 4 && s.includes(atStart[0].id) && s.every((id) => atStart.slice(0, 4).some((x) => x.id === id)), { tapped: atStart[0].id, s })
// 5) split by taken/aisle: short run (<4)
const short = rs.find((r) => r.length >= 1 && r.length < 4 && !r.some((x) => s.includes(x.id)))
await tap(p, short[0].id); s = await sel(p)
check('short-run-picks-k', s.length === short.length && (await p.locator('[data-short]').first().textContent()).includes(`Only ${short.length} seat`), { run: short.map((x) => x.id), s, say: await say(p) })
check('short-run-continue-disabled', await p.getByRole('button', { name: 'Continue' }).last().isDisabled())
await p.getByRole('button', { name: /Split the group/ }).first().click(); await p.waitForTimeout(300)
all = await seats(p); const extra = all.find((x) => x.free && !x.access && !x.sel)
await p.locator(`[data-seat="${extra.id}"]`).click(); await p.waitForTimeout(300); await openSheet(p)
check('split-adds-one-at-a-time', (await sel(p)).length === short.length + 1, { s: await sel(p) })
// 6) Find N together
await closeSheet(p).catch(() => {}); await p.waitForTimeout(200)
await p.locator('[aria-label*="Open seat picker"]').click(); await p.waitForTimeout(300)
// back to a short run to get the panel again
await closeSheet(p); await p.getByRole('button', { name: /Change seats/ }).click(); await p.waitForTimeout(300)
check('change-seats-clears-keeps-party', (await sel(p)).length === 0 && /4 people/.test(await p.locator('[data-party-chip]').textContent()) && (await p.locator('[data-pick-prompt]').count()) === 1)
await tap(p, short[0].id); await p.getByRole('button', { name: /Find 4 together/ }).first().click(); await p.waitForTimeout(200)
check('find-n-together-clears-and-pulses', (await sel(p)).length === 0 && (await p.locator('[data-pulse]').count()) > 0, { rows: await p.$$eval('[data-pulse]', (e) => e.length) })
// 7) wheelchair never auto-included
const acc = (await seats(p)).find((x) => x.access && x.free)
if (acc) { await tap(p, acc.id); check('wheelchair-not-auto-grouped', (await sel(p)).length === 0 && (await p.locator('[data-short]').count()) > 0) } else check('wheelchair-not-auto-grouped', true, { note: 'no free wheelchair space' })
// 8) change party size after picking: chip -> step, picks cleared
await tap(p, mid.id); await openSheet(p); await p.locator('[data-party-chip]').click(); await p.waitForSelector('[data-party-step]')
await p.locator('label:has(input[value="3"])').click(); await p.getByRole('button', { name: /Choose seats/ }).click(); await p.waitForSelector('[data-seat]')
check('party-change-clears', (await sel(p)).length === 0 && /3 people/.test(await p.locator('[data-party-chip]').textContent()))
// 9) Continue: SEAT_TAKEN clears the whole block, then a clean hold of the whole group
await tap(p, mid.id); const grp = await sel(p).catch(async () => { await openSheet(p); return sel(p) }); await openSheet(p); const g = await sel(p)
await p.evaluate((id) => sessionStorage.setItem('lumen.qa.takeOnHold', id), g[1])
await closeSheet(p); await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForTimeout(800)
const toastTxt = await p.locator('[data-sonner-toast]').allTextContents()
await openSheet(p)
check('seat-taken-clears-group', (await sel(p)).length === 0 && toastTxt.join(' ').includes(`${g[1]} was just taken`) && (await seats(p)).find((x) => x.id === g[1]).label.includes('taken'), { toastTxt, path: new globalThis.URL(p.url()).pathname, held: await p.evaluate(() => JSON.parse(sessionStorage.getItem('lumen.cart')).holdId) })
await p.evaluate(() => sessionStorage.removeItem('lumen.qa.takeOnHold'))
all = await seats(p); const r3 = runs(all).find((r) => r.length >= 3)
await tap(p, r3[1].id); const g2 = await (async () => { await openSheet(p); return sel(p) })()
await closeSheet(p); await p.getByRole('button', { name: 'Continue' }).click(); await p.waitForFunction(() => location.pathname === '/booking' && !!JSON.parse(sessionStorage.getItem('lumen.cart')).holdId, null, { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(500)
const cart = await p.evaluate(() => JSON.parse(sessionStorage.getItem('lumen.cart')))
check('continue-holds-whole-group', p.url().endsWith('/booking') && !!cart.holdId && cart.seats.length === 3, { g2, url: p.url(), cart: { seats: cart.seats, holdId: cart.holdId } })
// 10) Change seats after hold releases it (DELETE mock)
await p.getByRole('link', { name: 'Change seats' }).click(); await p.waitForTimeout(600); R._afterChange = p.url()
const rel = await p.evaluate(() => window.__lumenReleased ?? [])
check('change-seats-after-hold-releases', rel.includes(cart.holdId) && (await p.evaluate(() => JSON.parse(sessionStorage.getItem('lumen.cart')).holdId)) === null, { rel })
await c.close()
// 11) phone: first tap zooms, next places the block
{ const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }), q = await c2.newPage()
  await q.goto(URL + '&party=2'); await q.waitForSelector('[data-seat]')
  const free = runs(await seats(q)).find((r) => r.length >= 3)
  await q.locator(`[data-seat="${free[1].id}"]`).tap(); await q.waitForTimeout(500)
  const afterZoom = await sel(q)
  await q.locator(`[data-seat="${free[1].id}"]`).tap(); await q.waitForTimeout(500); await openSheet(q)
  const placed = await sel(q); const sz = await q.locator(`[data-seat="${free[1].id}"]`).boundingBox()
  check('phone-zoom-then-place', afterZoom.length === 0 && placed.length === 2 && placed.includes(free[1].id) && sz.width >= 44 && sz.height >= 44, { afterZoom, placed, target: [sz.width, sz.height] })
  await c2.close() }
check('no-page-errors', !errs.length, { errs })
console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(R, null, 1)); await b.close(); process.exit(ok ? 0 : 1)
