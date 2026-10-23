// (history.length 3 = about:blank, /, seats: replace adds no entry)
// fix15.1: expired/unknown ?show= falls forward to the next upcoming show (party kept, history.replace); no error card.
import { chromium } from 'playwright'
const port = process.argv[2] ?? 4175, b = await chromium.launch(); let fail = 0
for (const show of ['iron-orchard-2026-10-22-1845', 'iron-orchard-nope']) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await p.goto(`http://localhost:${port}/`); await p.goto(`http://localhost:${port}/movie/iron-orchard/seats?show=${show}&party=2&3d=0`)
  await p.waitForFunction((s) => !location.search.includes(s), show, { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(800)
  const u = new URL(p.url()), err = await p.getByText(/something went wrong|no bookable/i).count(), len = await p.evaluate(() => history.length)
  const ok = u.searchParams.get('show') !== show && u.searchParams.get('show')?.startsWith('iron-orchard-') && u.searchParams.get('party') === '2' && !err && len === 3
  console.log(ok ? 'PASS' : 'FAIL', show, '->', u.search, 'err', err, 'historyLen', len); if (!ok) fail++
}
await b.close(); console.log(fail ? 'SHOW_FALLBACK FAIL' : 'SHOW_FALLBACK PASS'); process.exit(fail ? 1 : 0)
