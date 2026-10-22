// Generates public/og.png (1200x630) placeholder share image. Re-run: node scripts/make-og.mjs
import { chromium } from 'playwright'
const html = `<html><body style="margin:0;width:1200px;height:630px;background:#0B0B0F;font-family:Inter,sans-serif;color:#F4F1EA;overflow:hidden;position:relative">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@500&display=block" rel="stylesheet">
<div style="position:absolute;left:150px;top:60px;width:900px;height:240px;border-radius:12px;background:linear-gradient(120deg,#F2B544,#7A1F2B 55%,#1E3A5F);box-shadow:0 0 160px rgba(242,181,68,.35)"></div>
<div style="position:absolute;left:0;right:0;bottom:0;height:160px;background:linear-gradient(to top,#0B0B0F 55%,transparent)"></div>
${Array.from({length:3},(_,r)=>`<div style="position:absolute;left:${60+r*20}px;right:${60+r*20}px;bottom:${16+r*40}px;display:flex;gap:10px;justify-content:center;opacity:${1-r*0.25}">${Array.from({length:20-r*2},()=>'<div style="width:44px;height:28px;border-radius:10px 10px 4px 4px;background:#7A1F2B"></div>').join('')}</div>`).join('')}
<div style="position:absolute;left:0;right:0;top:325px;text-align:center">
<div style="font-family:'Bebas Neue';font-size:96px;letter-spacing:4px;line-height:1">LUMEN CINEMA <span style="font-size:40px;color:#A3A0AE">[PH]</span></div>
<div style="font-size:28px;color:#F2B544;margin-top:6px">Pick your seat before you buy</div></div>
<div style="position:absolute;right:24px;top:20px;font-size:18px;color:#A3A0AE;border:1px solid #2A2A36;border-radius:99px;padding:6px 14px">PLACEHOLDER [PH]</div>
</body></html>`
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } })
await p.setContent(html, { waitUntil: 'networkidle' }); await p.waitForTimeout(300)
await p.screenshot({ path: 'public/og.png' }); await b.close()
