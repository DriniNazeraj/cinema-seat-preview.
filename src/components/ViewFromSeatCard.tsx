import type { Hall, Seat } from '@/lib/api'

/** Fallback "view from your seat": a generated illustration for 9 zones
 * (front/middle/back × left/centre/right). Real pre-rendered stills are [PH]. */
export function zoneOf(seat: Seat, hall: Hall) {
  const ri = hall.rows.findIndex((r) => r.label === seat.row)
  const depth = ri < 3 ? 'front' : ri < 7 ? 'middle' : 'back'
  const side = seat.x < hall.columns * 0.3 ? 'left' : seat.x > hall.columns * 0.7 ? 'right' : 'centre'
  return { depth, side } as const
}

export function ViewFromSeatCard({ seat, hall, note }: { seat: Seat | null; hall: Hall; note?: string }) {
  const z = seat ? zoneOf(seat, hall) : { depth: 'back', side: 'centre' as const }
  const scale = z.depth === 'front' ? 1.45 : z.depth === 'middle' ? 1 : 0.72
  const shift = z.side === 'left' ? 120 : z.side === 'right' ? -120 : 0
  const skew = z.side === 'left' ? -8 : z.side === 'right' ? 8 : 0
  const w = 520 * scale, h = 220 * scale
  const cx = 400 + shift, cy = 170 - (z.depth === 'front' ? 30 : 0)
  return (
    <figure className="relative h-full w-full overflow-hidden bg-[#08080b]">
      <svg viewBox="0 0 800 500" className="h-full w-full" preserveAspectRatio="xMidYMid slice" role="img"
        aria-label={seat ? `Approximate view from row ${seat.row}, seat ${seat.n}` : 'Overview of the hall'}>
        <defs>
          <radialGradient id="glow" cx="50%" cy="35%" r="60%"><stop offset="0" stopColor="#F4F1EA" stopOpacity="0.18" /><stop offset="1" stopColor="#0B0B0F" stopOpacity="0" /></radialGradient>
          <linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F2B544" /><stop offset="0.5" stopColor="#7A1F2B" /><stop offset="1" stopColor="#1E3A5F" /></linearGradient>
        </defs>
        <rect width="800" height="500" fill="url(#glow)" />
        <g transform={`translate(${cx} ${cy}) skewY(${skew})`}>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill="url(#scr)" opacity="0.9" />
        </g>
        {Array.from({ length: z.depth === 'front' ? 2 : z.depth === 'middle' ? 4 : 6 }, (_, r) => {
          const y = 500 - r * 28
          return (
            <g key={r} opacity={0.9 - r * 0.1}>
              {Array.from({ length: 18 }, (_, i) => (
                <rect key={i} x={i * 48 - 40 + shift * 0.3 + (r % 2) * 12} y={y - 24} width="40" height={30 - r * 2} rx="8" fill="#7A1F2B" opacity="0.8" />
              ))}
            </g>
          )
        })}
        {[0, 1, 2, 3].map((i) => <circle key={i} cx={30} cy={180 + i * 80} r="4" fill="#F2B544" opacity="0.6" />)}
        {[0, 1, 2, 3].map((i) => <circle key={i} cx={770} cy={180 + i * 80} r="4" fill="#F2B544" opacity="0.6" />)}
      </svg>
      <figcaption className="absolute bottom-3 left-3 rounded-full bg-bg/80 px-3 py-1 text-xs ring-1 ring-border">
        {seat ? `Approximate view from Row ${seat.row}` : 'Pick a seat to see its view'} · {z.depth} {z.side} [PH]
      </figcaption>
      {note && <p className="absolute right-3 top-3 rounded-full bg-bg/80 px-3 py-1 text-[11px] text-text-muted ring-1 ring-border">{note}</p>}
    </figure>
  )
}
