// fix15.2 (PR #3 rule): an ENDED show (404 NOT_FOUND, or 200 with a past start) redirects to the next showtime (history.replace, party kept,
// toast). A network/5xx failure stays on the page: "Couldn't load seats. Check your connection." + working Try again, party kept, curtain cleared.
// (history.length 3 = about:blank, /, seats: replace adds no entry)
import { chromium } from 'playwright'
const port = process.argv[2] ?? 4175, base = `http://localhost:${port}`, b = await chromium.launch(); let fail = 0
const say = (ok, ...a) => { console.log(ok ? 'PASS' : 'FAIL', ...a); if (!ok) fail++ }
const past = new Date(Date.now() - 2 * 864e5), day = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
for (const [label, show] of [['ended 200 past start', `iron-orchard-${day}-1845`], ['404 not found', 'iron-orchard-nope']]) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await p.goto(`${base}/`); await p.goto(`${base}/movie/iron-orchard/seats?show=${show}&party=2&3d=0`)
  await p.waitForFunction((s) => !location.search.includes(s), show, { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(800)
  const u = new URL(p.url()), err = await p.getByText(/couldn't load|no bookable/i).count(), len = await p.evaluate(() => history.length)
  const toast = await p.getByText(/^That showing has ended\. Here's the next one/).count()
  say(u.searchParams.get('show') !== show && u.searchParams.get('show')?.startsWith('iron-orchard-') && u.searchParams.get('party') === '2' && !err && len === 3 && toast === 1 && (await p.locator('[data-sonner-toast]').count()) === 1,
    label, show, '->', u.search, 'err', err, 'historyLen', len, 'toast', toast)
}
{ // network failure
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); await c.addInitScript(() => { if (!sessionStorage.getItem('qa.init')) { sessionStorage.setItem('qa.init', '1'); sessionStorage.setItem('lumen.qa.failSeatMap', '1') } })
  const p = await c.newPage(); const show = 'iron-orchard-2026-10-25-1845'
  await p.goto(`${base}/movie/iron-orchard/seats?show=${show}&party=2&3d=0`)
  const msg = await p.getByText("Couldn't load seats. Check your connection.").waitFor({ timeout: 15000 }).then(() => true, () => false)
  await p.waitForTimeout(500)
  const s1 = await p.evaluate(() => ({ url: location.search, overlay: !!document.getElementById('seat-static') }))
  say(msg && s1.url.includes(show) && s1.url.includes('party=2') && !s1.overlay, 'network error stays on page', JSON.stringify(s1))
  await p.evaluate(() => sessionStorage.removeItem('lumen.qa.failSeatMap'))
  await p.getByRole('button', { name: /try again/i }).click()
  const ok = await p.locator('[data-seat]').first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  const s2 = await p.evaluate(() => ({ url: location.search, err: document.body.innerText.includes("Couldn't load seats") }))
  say(ok && !s2.err && s2.url.includes(show) && s2.url.includes('party=2'), 'Try again loads seats, show + party kept', JSON.stringify(s2))
}
await b.close(); console.log(fail ? 'SHOW_FALLBACK FAIL' : 'SHOW_FALLBACK PASS'); process.exit(fail ? 1 : 0)
