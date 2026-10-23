/** §11 seat sheet on Radix Dialog (non-modal so the hall stays draggable) + FocusScope trap.
 *  Mobile <768: bottom sheet h-[72svh] (fix15.1: fixed, not max-h, so late content/font swap can't move its top edge = CLS) with drag handle. Desktop: floating panel right-4 top-16 bottom-4 w-[min(480px,40vw)]. Focus lands on the title on open (fix6). */
import * as D from '@radix-ui/react-dialog'
import { FocusScope } from '@radix-ui/react-focus-scope'
import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

export function SeatSheet({ open, onCollapse, title, children, footer }: { open: boolean; onCollapse: () => void; title: string; children: ReactNode; footer: ReactNode }) {
  const startY = useRef<number | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  return (
    <D.Root open={open} modal={false} onOpenChange={(o) => { if (!o) onCollapse() }}>
      <D.Portal>
        <D.Content
          onOpenAutoFocus={(e) => { e.preventDefault(); titleRef.current?.focus() }}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-[55] flex h-[72svh] flex-col rounded-t-2xl bg-surface/95 ring-1 ring-border backdrop-blur focus:outline-none md:inset-x-auto md:bottom-4 md:right-4 md:top-16 md:h-auto md:w-[min(480px,40vw)] md:rounded-2xl"
        >
          <FocusScope trapped={open} loop asChild onMountAutoFocus={(e) => { e.preventDefault(); titleRef.current?.focus({ preventScroll: true }) }}>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex h-6 cursor-grab touch-none items-center justify-center md:hidden" aria-hidden
                onPointerDown={(e) => { startY.current = e.clientY }}
                onPointerUp={(e) => { if (startY.current !== null && e.clientY - startY.current > 60) onCollapse(); startY.current = null }}>
                <span className="h-1.5 w-10 rounded-full bg-border" />
              </div>
              <div className="flex items-center justify-between px-4 pb-2 md:pt-3">
                <D.Title ref={titleRef} tabIndex={-1} className="font-display text-2xl uppercase tracking-wide focus:outline-none">{title}</D.Title>
                <D.Description className="sr-only">Pick seats on the map. The 3D hall shows the view from your seat.</D.Description>
                <D.Close aria-label="Collapse seat picker" className="grid size-11 place-items-center rounded-full bg-bg/80 ring-1 ring-border hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <X className="size-5" aria-hidden />
                </D.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{children}</div>
              <div className="border-t border-border px-4 py-3">{footer}</div>
            </div>
          </FocusScope>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
