/** fix7: every page is its own chunk. route() = React.lazy that renders synchronously once preloaded,
 *  so main.tsx can load the current page's chunk before the first render (no Suspense flash over the
 *  prerendered HTML) and the SSR prerender can preload all pages before renderToString. */
import { lazy, type ComponentType } from 'react'
import { matchPath } from 'react-router-dom'

type Mod = { default: ComponentType }
function route(load: () => Promise<Mod>) {
  let C: ComponentType | null = null
  const preload = () => load().then((m) => { C = m.default; return m })
  const L = lazy(preload)
  const R = () => (C ? <C /> : <L />)
  return Object.assign(R, { preload })
}
export const Home = route(() => import('@/pages/Home'))
export const NowShowing = route(() => import('@/pages/NowShowing'))
export const MoviePage = route(() => import('@/pages/Movie'))
export const BookingPage = route(() => import('@/pages/Booking'))
export const Confirmed = route(() => import('@/pages/Confirmed'))

const table: [string, { preload: () => Promise<unknown> }][] = [
  ['/', Home], ['/now-showing', NowShowing], ['/movie/:id', MoviePage], ['/booking', BookingPage], ['/booking/confirmed', Confirmed],
]
export function preloadRoute(pathname: string) {
  const hit = table.find(([p]) => matchPath(p, pathname))
  return hit ? hit[1].preload().catch(() => undefined) : Promise.resolve()
}
export const preloadAll = () => Promise.all(table.map(([, r]) => r.preload()))
