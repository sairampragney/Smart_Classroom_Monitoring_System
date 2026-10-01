/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ---- Dark Violet AI + IoT Command Center palette ----
        bg: {
          deep: '#070611',
          secondary: '#0D0B1A',
          card: '#121022',
        },
        violet: {
          DEFAULT: '#8B5CF6',
          electric: '#A855F7',
          soft: '#C084FC',
        },
        indigo: {
          DEFAULT: '#6366F1',
        },
        fg: {
          DEFAULT: '#F8FAFC',
          muted: '#94A3B8',
        },
        // Semantic status colours - used ONLY for state, never as theme accents.
        status: {
          ok: '#22C55E',
          warn: '#F59E0B',
          bad: '#EF4444',
          idle: '#64748B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(139, 92, 246, 0.45)',
        'glow-lg': '0 0 48px -8px rgba(139, 92, 246, 0.55)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 32px -12px rgba(0,0,0,0.8)',
      },
      backgroundImage: {
        'grid-fine':
          'linear-gradient(rgba(139,92,246,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.055) 1px, transparent 1px)',
        'radial-violet':
          'radial-gradient(ellipse 80% 55% at 50% -10%, rgba(139,92,246,0.18), transparent 70%)',
      },
      backgroundSize: {
        grid: '44px 44px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.85' },
        },
      },
      animation: {
        'fade-in': 'fade-in 260ms ease-out both',
        'pulse-ring': 'pulse-ring 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}