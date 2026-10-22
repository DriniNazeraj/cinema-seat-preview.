import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App'
import { BookingProvider } from '@/lib/booking'
import { DataContext } from '@/lib/useData'
import { getMovie, listMovies, listShows } from '@/lib/api'
import { headTags, metaFor } from '@/lib/seo'
export { __static } from '@/lib/api'

export async function render(url: string) {
  const data: Record<string, unknown> = { movies: await listMovies() }
  if (url === '/' || url === '/now-showing') data['shows:all'] = await listShows()
  const m = url.match(/^\/movie\/([^/]+)$/)
  if (m) { data[`movie:${m[1]}`] = await getMovie(m[1]); data[`shows:${m[1]}`] = await listShows({ movieId: m[1] }) }
  const html = renderToString(
    <DataContext.Provider value={data}>
      <StaticRouter location={url}><BookingProvider><App /></BookingProvider></StaticRouter>
    </DataContext.Provider>,
  )
  const noindex = url.startsWith('/booking')
  return { html, head: headTags(metaFor(url), noindex), data }
}
