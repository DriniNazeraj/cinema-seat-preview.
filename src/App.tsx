import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Container, Skeleton } from '@/components/ui'
import Home from '@/pages/Home'
import NowShowing from '@/pages/NowShowing'
import MoviePage from '@/pages/Movie'
import BookingPage from '@/pages/Booking'
import Confirmed from '@/pages/Confirmed'

const SeatsPage = lazy(() => import('@/pages/Seats'))

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="now-showing" element={<NowShowing />} />
        <Route path="movie/:id" element={<MoviePage />} />
        <Route path="movie/:id/seats" element={<Suspense fallback={<Container className="min-h-[115svh] py-10"><Skeleton className="h-96" /></Container>}><SeatsPage /></Suspense>} />
        <Route path="booking" element={<BookingPage />} />
        <Route path="booking/confirmed" element={<Confirmed />} />
        <Route path="*" element={<Container className="py-24 text-center"><h1 className="font-display text-6xl">Not found</h1></Container>} />
      </Route>
    </Routes>
  )
}
