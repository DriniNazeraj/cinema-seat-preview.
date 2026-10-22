/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { bg: '#0B0B0F', surface: '#15151C', 'surface-2': '#1E1E28', border: '#2A2A36', text: '#F4F1EA', 'text-muted': '#A3A0AE', accent: '#F2B544', 'accent-fg': '#1A1205', velvet: '#7A1F2B', taken: '#3A3A44', access: '#3B82F6', danger: '#EF4444', success: '#22C55E' },
    fontFamily: { display: ['"Bebas Neue"', 'Oswald', 'sans-serif'], sans: ['Inter', 'system-ui', 'sans-serif'] },
    keyframes: { shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-3px)' }, '75%': { transform: 'translateX(3px)' } } },
    animation: { shake: 'shake 0.25s ease-in-out 2' },
  } },
}
