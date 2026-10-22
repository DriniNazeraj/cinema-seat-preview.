import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { BookingProvider } from '@/lib/booking'
import { DataContext, type DataCache } from '@/lib/useData'
import './index.css'

declare global { interface Window { __DATA__?: DataCache } }

// Prerendered HTML is for crawlers + first paint; the client re-renders fresh
// (dates/showtimes are relative to "today", so we don't hydrate stale markup).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataContext.Provider value={window.__DATA__ ?? {}}>
      <BrowserRouter>
        <BookingProvider><App /></BookingProvider>
      </BrowserRouter>
    </DataContext.Provider>
  </StrictMode>,
)
