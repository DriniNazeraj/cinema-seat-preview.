import { chromium } from 'playwright'
const b = await chromium.launch()
for (const u of ['/movie/iron-orchard/seats?3d=1','/movie/iron-orchard/seats?simple=1','/nope/x?3d=0','/movie/iron-orchard']) {
  const p = await b.newPage(); const hits=[]; const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('request', r => { if (/velvet-tile|inter-latin/.test(r.url())) hits.push(r.url().split('/').pop()+':'+(r.frame()&&r.resourceType())) })
  await p.goto('http://localhost:4175'+u); await p.waitForTimeout(400)
  console.log(u, hits.join(','), errs.length, await p.evaluate(()=>!!document.querySelector('link[rel=preload][href="/velvet-tile.webp"]')))
  await p.close()
}
await b.close()
