import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { HOLD_SECONDS } from './api'

// fix11: partySize = group size the picker reads. Set by the 'How many people?' step now; the §13 tickets step will drive it later.
type State = { showId: string | null; seats: string[]; holdUntil: number | null; holdId: string | null; lastRef: string | null; partySize: number }
type Ctx = State & {
  setShow: (id: string) => void
  toggleSeat: (id: string) => void
  startHold: () => void
  clear: () => void
  setSeats: (ids: string[]) => void
  setPartySize: (n: number) => void
  /** fix16.1: change the count, keep picks; lowering below the picks drops the most recent ones */
  resizeParty: (n: number) => void
  setHold: (id: string, until: number) => void
  releaseHold: () => void
  setLastRef: (ref: string) => void
}
const KEY = 'lumen.cart'
const empty: State = { showId: null, seats: [], holdUntil: null, holdId: null, lastRef: null, partySize: 2 }
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
    setSeats: (ids) => set((p) => ({ ...p, seats: ids })),
    setPartySize: (n) => set((p) => ({ ...p, partySize: Math.min(8, Math.max(1, n)), seats: [] })),
    resizeParty: (n) => set((p) => { const size = Math.min(8, Math.max(1, n)); return { ...p, partySize: size, seats: p.seats.slice(0, size) } }),
    setHold: (id, until) => set((p) => ({ ...p, holdId: id, holdUntil: until })),
    // DELETE /api/holds/:id (mock) when a hold exists; nothing is held before Continue
    releaseHold: () => set((p) => { if (p.holdId) void import('./api').then((m) => m.releaseHoldApi(p.holdId!)); return { ...p, holdId: null, holdUntil: null } }),
    clear: () => set((p) => ({ ...empty, lastRef: p.lastRef, partySize: p.partySize })),
    setLastRef: (ref) => set((p) => ({ ...p, lastRef: ref })),
  }
  return <BookingCtx.Provider value={ctx}>{children}</BookingCtx.Provider>
}
export function useBooking() {
  const c = useContext(BookingCtx)
  if (!c) throw new Error('BookingProvider missing')
  return c
}
