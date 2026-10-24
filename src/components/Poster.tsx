import type { Movie } from '@/lib/api'
import { cn } from '@/lib/format'

/** Generated placeholder poster (no image assets). [PH] */
export function Poster({ movie, className, wide = false }: { movie: Movie; className?: string; wide?: boolean }) {
  const [a, b] = movie.palette
  const id = `g-${movie.id}${wide ? '-w' : ''}`
  const vb = wide ? '0 0 1600 900' : '0 0 400 600'
  const [w, h] = wide ? [1600, 900] : [400, 600]
  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" className={cn('block h-full w-full', className)} role="img" aria-label={`${movie.title} poster (placeholder)`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={b} stopOpacity="0.9" />
          <stop offset="0.55" stopColor={a} />
          <stop offset="1" stopColor="#0B0B0F" />
        </linearGradient>
      </defs>
      <rect width={w} height={h} fill={`url(#${id})`} />
      <circle cx={w * 0.7} cy={h * 0.3} r={w * (wide ? 0.12 : 0.22)} fill={b} opacity="0.35" />
      <circle cx={w * 0.25} cy={h * 0.55} r={w * (wide ? 0.06 : 0.12)} fill="#F4F1EA" opacity="0.08" />
      {!wide && (
        <text x="28" y={h - 48} fill="#F4F1EA" fontFamily="'Bebas Neue', Oswald, sans-serif" fontSize="58" letterSpacing="2">
          {movie.title.toUpperCase()}
        </text>
      )}
      {!wide && <text x="28" y={h - 20} fill="#F4F1EA" opacity="0.6" fontFamily="Inter, sans-serif" fontSize="16">[PH] poster</text>}
    </svg>
  )
}
