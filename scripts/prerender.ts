// Build-time prerender: writes dist/<route>/index.html with real content + per-page
// title/meta/OG/JSON-LD. The seat picker is intentionally NOT prerendered (SPA fallback).
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const dist = path.resolve('dist')
const mod = await import(pathToFileURL(path.resolve('dist-ssr/entry-server.js')).href)
// fix5: HallScene3D chunk (+ static imports) for the idle <link rel=prefetch> in src/lib/prefetch3d.ts
const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'))
const hallKey = Object.keys(manifest).find((k) => k.endsWith('three/HallScene3D.tsx'))!
const hallUrls = [manifest[hallKey].file, ...(manifest[hallKey].imports ?? []).map((k: string) => manifest[k].file).filter((f: string) => !/index-/.test(f))].map((f: string) => '/' + f)
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8').replace('<!--head-->', `<meta name="lumen-hall3d" content="${hallUrls.join(',')}" />\n    <!--head-->`)
const routes = ['/', '/now-showing', '/booking', '/booking/confirmed', ...mod.__static.movies().map((m: { id: string }) => `/movie/${m.id}`)]

// keep a pristine SPA shell for non-prerendered routes (seat picker)
// fix10: Inter preload helps the movie page (synopsis LCP) but on the seat route it only competes with the display font +
// velvet for the static curtain LCP (+150 ms in Lighthouse), so seat HTML (incl. 200.html) drops it
const INTER = '<link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />'
const noInter = (h: string) => h.replace(INTER, '')
// fix11 (SEO): 200.html keeps the Inter preload (seat page UI text is Inter)
fs.writeFileSync(path.join(dist, '200.html'), template.replace('<!--head-->', '<script>/* fix10: velvet tile only when this visit goes 3D (mirrors decideThree\'s cheap checks; WebGL probe left to the app) */(function(){try{var q=new URLSearchParams(location.search),n=navigator,c=n.connection||{};if(q.get(\'3d\')!==\'1\'&&(q.get(\'simple\')===\'1\'||localStorage.getItem(\'lumen.simple\')===\'1\'||c.saveData||(n.hardwareConcurrency||8)<=2||!/\\/seats\\/?$/.test(location.pathname))){document.documentElement.classList.add(\'no3d\');return}var l=document.createElement(\'link\');l.rel=\'preload\';l.as=\'image\';l.type=\'image/webp\';l.href=\'/velvet-tile.webp\';l.fetchPriority=\'high\';document.head.appendChild(l)}catch(e){}})()</script>\n    <meta name="robots" content="noindex" />\n    <meta name="description" content="Choose your seats with a 3D view from your seat. Lumen Cinema [PH] demo." />'))

// fix7: pages are code-split; modulepreload the current page's chunk (+ its non-entry imports) so it loads in parallel with the entry
const pageFile = (r: string) => r === '/' ? 'Home' : r === '/now-showing' ? 'NowShowing' : r === '/booking' ? 'Booking' : r === '/booking/confirmed' ? 'Confirmed' : 'Movie'
function pageChunks(name: string) {
  const key = Object.keys(manifest).find((k) => k.endsWith(`pages/${name}.tsx`)); if (!key) return []
  const seen = new Set<string>(); const walk = (k: string) => { if (seen.has(k) || manifest[k].isEntry) return; seen.add(k); (manifest[k].imports ?? []).forEach(walk) }
  walk(key); return [...seen].map((k) => '/' + manifest[k].file)
}
// fix9: LCP must be <= 2.6 s in every run. The seat route is client-rendered, so its LCP (the curtain title) waited for
// entry JS + Seats chunk + data. Each film's seat URL now gets a static copy of the curtain overlay (same markup/classes as
// Seats.tsx) + the movie in window.__DATA__, so the title paints from HTML and React re-renders the identical text (not a new,
// larger LCP candidate). Still noindex, still the SPA shell otherwise.
const seatsHead = '<script>/* fix10: velvet tile only when this visit goes 3D (mirrors decideThree\'s cheap checks; WebGL probe left to the app) */(function(){try{var q=new URLSearchParams(location.search),n=navigator,c=n.connection||{};if(q.get(\'3d\')!==\'1\'&&(q.get(\'simple\')===\'1\'||localStorage.getItem(\'lumen.simple\')===\'1\'||c.saveData||(n.hardwareConcurrency||8)<=2||!/\\/seats\\/?$/.test(location.pathname))){document.documentElement.classList.add(\'no3d\');return}var l=document.createElement(\'link\');l.rel=\'preload\';l.as=\'image\';l.type=\'image/webp\';l.href=\'/velvet-tile.webp\';l.fetchPriority=\'high\';document.head.appendChild(l)}catch(e){}})()</script>\n    <meta name="robots" content="noindex" />\n    <meta name="description" content="Choose your seats with a 3D view from your seat. Lumen Cinema [PH] demo." />'
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
for (const m of mod.__static.movies() as { id: string; title: string }[]) {
  // fix13 (CLS 0.013): reserve the "Choose seats" button row (mt-5 + 44px) so the centred title block does not jump when React mounts
  const overlay = `<div id="seat-static" aria-hidden="true" class="fixed inset-0 z-40 h-[100svh] overflow-hidden bg-bg"><div class="fixed inset-0 z-50 overflow-hidden"><div class="curtain velvet-static absolute top-0 h-full w-[50.5%] left-0"></div><div class="curtain velvet-static absolute top-0 h-full w-[50.5%] right-0 -scale-x-100"></div></div><div class="fixed inset-0 z-[60] grid place-items-center p-6 text-center"><div><p class="font-display text-4xl tracking-[0.2em] text-[#F4F1EA] md:text-6xl">LUMEN<span class="ml-1 align-top font-sans text-[10px] tracking-normal text-text-muted">[PH]</span></p><h1 class="mt-4 min-h-10 font-display text-4xl uppercase tracking-wide md:text-5xl">${esc(m.title)} <span class="text-base text-text-muted">[PH]</span></h1><p class="min-h-5 text-sm text-[#F4F1EA]/80">&nbsp;</p><p class="mt-2 text-sm text-text-muted">Setting up the hall…</p><div class="mt-5 min-h-11" data-reserve="choose-seats"></div></div></div></div>`
  const data = { [`movie:${m.id}`]: m }
  // static overlay lives OUTSIDE #root (React never replaces it), so it is the first, early LCP candidate; Seats.tsx removes it
  // when the real curtains are gone (equal-size React curtains painted later are not a new, larger LCP candidate)
  const out = template.replace('<!--head-->', seatsHead) // fix12 (SEO): seat pages preload Inter too.replace('<div id="root"><!--app--></div>', overlay + '<div id="root"></div>').replace('</body>', `<script>window.__DATA__=${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n  </body>`)
  const file = path.join(dist, `movie/${m.id}/seats/index.html`)
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, out)
}
for (const r of routes) {
  const { html, head: head0, data } = await mod.render(r)
  const head = head0 + pageChunks(pageFile(r)).map((u) => `\n    <link rel="modulepreload" crossorigin href="${u}" />`).join('')
  const out = template.replace(/<title>.*?<\/title>/, '').replace('<!--head-->', head).replace('<!--app-->', html).replace('</body>', `<script>window.__DATA__=${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n  </body>`)
  const file = path.join(dist, r === '/' ? 'index.html' : `${r.slice(1)}/index.html`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, out)
  console.log('prerendered', r)
}
const urls = routes.filter((r) => !r.startsWith('/booking')).map((r) => `  <url><loc>https://lumen-cinema.example${r}</loc></url>`).join('\n')
fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
fs.appendFileSync(path.join(dist, 'robots.txt'), 'Sitemap: https://lumen-cinema.example/sitemap.xml\n')
fs.rmSync(path.join(dist, '.vite'), { recursive: true, force: true }) // manifest only needed at build time
fs.rmSync('dist-ssr', { recursive: true, force: true })
