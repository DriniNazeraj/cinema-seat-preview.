import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Toaster } from 'sonner'
import { ButtonLink, Container } from './ui'
import { metaFor } from '@/lib/seo'

export function Layout() {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => {
    setOpen(false)
    window.scrollTo(0, 0)
    if (!/\/seats$/.test(loc.pathname)) document.title = metaFor(loc.pathname).title
  }, [loc.pathname])
  const link = 'rounded-full px-3 py-2 text-sm text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
  return (
    <div className="flex min-h-svh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Link to="/" className="font-display text-3xl tracking-wide text-text">
            LUMEN<span className="ml-1 align-top text-[10px] font-sans text-text-muted">[PH]</span>
          </Link>
          <nav className="hidden items-center gap-2 md:flex" aria-label="Main">
            <NavLink to="/now-showing" className={link}>Now Showing</NavLink>
            <a href="/#about" className={link}>About [PH]</a>
            <ButtonLink to="/now-showing" className="ml-2">Book tickets</ButtonLink>
          </nav>
          <button className="grid size-11 place-items-center rounded-full ring-1 ring-border md:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
        </Container>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col gap-2 bg-surface p-4 ring-1 ring-border">
            <button className="ml-auto grid size-11 place-items-center rounded-full ring-1 ring-border" aria-label="Close menu" onClick={() => setOpen(false)}><X className="size-5" /></button>
            <Link to="/now-showing" className="rounded-xl px-3 py-3 hover:bg-surface-2">Now Showing</Link>
            <a href="/#about" className="rounded-xl px-3 py-3 hover:bg-surface-2">About [PH]</a>
            <ButtonLink to="/now-showing" className="mt-2">Book tickets</ButtonLink>
          </div>
        </div>
      )}
      <main id="main" className="flex-1"><Outlet /></main>
      <footer id="about" className="border-t border-border py-12 text-sm text-text-muted">
        <Container className="grid gap-6 md:grid-cols-3">
          <div><p className="font-display text-2xl tracking-wide text-text">LUMEN CINEMA [PH]</p><p>1 Placeholder Street, Tirana [PH]</p></div>
          <div><p className="text-text">Hours [PH]</p><p>Mon–Sun · 12:00–24:00</p></div>
          <div className="flex gap-4 md:justify-end"><Link to="/now-showing" className="hover:text-text">Now showing</Link><a href="/#about" className="hover:text-text">Contact [PH]</a></div>
          <p className="md:col-span-3">Demo site. All films, times and prices are placeholders. No real bookings.</p>
        </Container>
      </footer>
      <Toaster theme="dark" position="top-center" toastOptions={{ style: { background: '#15151C', border: '1px solid #2A2A36', color: '#F4F1EA' } }} />
    </div>
  )
}
