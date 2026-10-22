import { Link, type LinkProps } from 'react-router-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/format'

const base = 'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-50 disabled:cursor-not-allowed min-h-11 px-5 text-sm'
const variants = {
  primary: 'bg-accent text-accent-fg hover:bg-[#f5c56a]',
  ghost: 'ring-1 ring-border text-text hover:bg-surface-2',
  subtle: 'bg-surface-2 text-text hover:bg-border',
}
type V = keyof typeof variants
export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: V }) {
  return <button className={cn(base, variants[variant], className)} {...p} />
}
export function ButtonLink({ variant = 'primary', className, ...p }: LinkProps & { variant?: V }) {
  return <Link className={cn(base, variants[variant], className)} {...p} />
}
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl bg-surface ring-1 ring-border', className)}>{children}</div>
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-2', className)} />
}
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 md:px-6', className)}>{children}</div>
}
export function PH() {
  return <span className="ml-1 rounded bg-surface-2 px-1 align-middle text-[10px] font-medium tracking-normal text-text-muted" title="Placeholder">[PH]</span>
}
export function ErrorCard({ onRetry, message = "Couldn't load this." }: { onRetry: () => void; message?: string }) {
  return (
    <Card className="p-6 text-center">
      <p className="mb-4 text-text-muted">{message}</p>
      <Button onClick={onRetry}>Try again</Button>
    </Card>
  )
}
