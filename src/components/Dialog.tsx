/** shadcn-style Dialog + Sheet on Radix: focus trap, Esc to close, focus returns to the trigger. */
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/format'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

function Close({ label }: { label: string }) {
  return (
    <D.Close className="grid size-11 place-items-center rounded-full bg-bg/80 ring-1 ring-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label={label}>
      <X className="size-5" aria-hidden />
    </D.Close>
  )
}

export function DialogContent({ title, description, children, className, closeLabel = 'Close' }: { title: string; description?: string; children: ReactNode; className?: string; closeLabel?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/80" />
      <D.Content className={cn('fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl bg-surface ring-1 ring-border focus:outline-none', className)}>
        <D.Title className="sr-only">{title}</D.Title>
        {description ? <D.Description className="sr-only">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        {children}
        <div className="absolute right-3 top-3"><Close label={closeLabel} /></div>
      </D.Content>
    </D.Portal>
  )
}

export function SheetContent({ title, children }: { title: string; children: ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <D.Content className="fixed right-0 top-0 z-50 flex h-full w-72 flex-col gap-2 bg-surface p-4 ring-1 ring-border focus:outline-none">
        <D.Title className="sr-only">{title}</D.Title>
        <D.Description className="sr-only">{title}</D.Description>
        <div className="ml-auto"><Close label="Close menu" /></div>
        {children}
      </D.Content>
    </D.Portal>
  )
}
