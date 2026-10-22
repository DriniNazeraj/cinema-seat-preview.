import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { HOLD_SECONDS } from './api'

type State = { showId: string | null; seats: string[]; holdUntil: number | null; lastRef: string | null }
type Ctx = State & {
  setShow: (id: string) => void
  toggleSeat: (id: string) => void
  startHold: () => void
  clear: () => void
  setLastRef: (ref: string) => void
}
const KEY = 'lumen.cart'
const empty: State = { showId: null, seats: [], holdUntil: null, lastRef: null }
const BookingCtx = createContext<Ctx | null>(null)

export function BookingProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<State>(() => {
    if (typeof window === 'undefined') return empty
    try { return { ...empty, ...JSON.parse(sessionStorage.getItem(KEY) ?? '{}') } } catch { return empty }
  })
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } }, [s])
  const ctx: Ctx = {
    ...s,
    setShow: (id) => set((p) => (p.showId === id ? p : { ...p, showId: id, seats: [], holdUntil: null })),
    toggleSeat: (id) => set((p) => ({ ...p, seats: p.seats.includes(id) ? p.seats.filter((x) => x !== id) : [...p.seats, id] })),
    startHold: () => set((p) => ({ ...p, holdUntil: p.holdUntil && p.holdUntil > Date.now() ? p.holdUntil : Date.now() + HOLD_SECONDS * 1000 })),
    clear: () => set((p) => ({ ...empty, lastRef: p.lastRef })),
    setLastRef: (ref) => set((p) => ({ ...p, lastRef: ref })),
  }
  return <BookingCtx.Provider value={ctx}>{children}</BookingCtx.Provider>
}
export function useBooking() {
  const c = useContext(BookingCtx)
  if (!c) throw new Error('BookingProvider missing')
  return c
}
