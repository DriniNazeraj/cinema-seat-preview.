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
fs.writeFileSync(path.join(dist, '200.html'), template.replace('<!--head-->', '<link rel="preload" as="image" href="/velvet-tile.webp" type="image/webp" fetchpriority="high" />\n    <meta name="robots" content="noindex" />\n    <meta name="description" content="Choose your seats with a 3D view from your seat. Lumen Cinema [PH] demo." />'))

for (const r of routes) {
  const { html, head, data } = await mod.render(r)
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
