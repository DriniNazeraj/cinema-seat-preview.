import { __static } from './api'
export const SITE = 'Lumen Cinema [PH]'
export const ORIGIN = 'https://lumen-cinema.example' // [PH] real domain

export type Meta = { title: string; description: string; path: string; jsonLd?: object[] }

export const theaterLd = {
  '@context': 'https://schema.org', '@type': 'MovieTheater',
  name: 'Lumen Cinema [PH]', description: 'PLACEHOLDER cinema for demo purposes',
  address: { '@type': 'PostalAddress', streetAddress: '1 Placeholder Street [PH]', addressLocality: 'Tirana [PH]', addressCountry: 'AL' },
  openingHours: 'Mo-Su 12:00-24:00', url: ORIGIN, screenCount: 2,
}

export function metaFor(path: string): Meta {
  const movies = __static.movies()
  const m = path.match(/^\/movie\/([^/]+)$/)
  if (m) {
    const movie = movies.find((x) => x.id === m[1])
    if (movie) return {
      title: `${movie.title} [PH] · tickets & showtimes | ${SITE}`,
      description: `${movie.tagline} ${movie.runtime} min · ${movie.rating} · ${movie.genres.join(', ')}. Pick your seat in 3D before you buy. [PH]`,
      path,
      jsonLd: [theaterLd, {
        '@context': 'https://schema.org', '@type': 'Movie', name: `${movie.title} [PH]`,
        description: movie.synopsis, genre: movie.genres, duration: `PT${movie.runtime}M`,
        contentRating: movie.rating, image: `${ORIGIN}/og.png`,
        disambiguatingDescription: 'PLACEHOLDER film for demo purposes',
      }],
    }
  }
  const table: Record<string, Omit<Meta, 'path'>> = {
    '/': { title: `${SITE} · Pick your seat before you buy`, description: 'See the view from your seat in 3D, then book. Placeholder cinema demo. [PH]', jsonLd: [theaterLd] },
    '/now-showing': { title: `Now showing | ${SITE}`, description: 'All films and showtimes this week at Lumen Cinema [PH].', jsonLd: [theaterLd] },
    '/booking': { title: `Your booking | ${SITE}`, description: 'Review your seats and confirm (demo, no payment).' },
    '/booking/confirmed': { title: `Booking confirmed | ${SITE}`, description: 'Your demo booking is confirmed.' },
  }
  return { ...(table[path] ?? { title: SITE, description: 'Lumen Cinema [PH]' }), path }
}

export function headTags(meta: Meta, noindex = false) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const url = ORIGIN + meta.path
  return [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${ORIGIN}/og.png" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    noindex ? `<meta name="robots" content="noindex" />` : '',
    ...(meta.jsonLd ?? []).map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
  ].filter(Boolean).join('\n    ')
}
