import { StrictMode, startTransition } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { preloadRoute } from '@/routes'
import { BookingProvider } from '@/lib/booking'
import { DataContext, type DataCache } from '@/lib/useData'
import './index.css'

declare global { interface Window { __DATA__?: DataCache } }

// Prerendered HTML is for crawlers + first paint; the client re-renders fresh
// (dates/showtimes are relative to "today", so we don't hydrate stale markup).
// fix7: fetch only the current page's chunk, then render (prerendered HTML stays on screen meanwhile)
// first render as a transition: React yields every ~5ms, so the initial render is many short tasks, not one long one
preloadRoute(location.pathname).then(() => startTransition(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataContext.Provider value={window.__DATA__ ?? {}}>
      <BrowserRouter>
        <BookingProvider><App /></BookingProvider>
      </BrowserRouter>
    </DataContext.Provider>
  </StrictMode>,
)))
