import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      animation: {
        /* Entradas */
        'fade-in': 'fadeIn 0.35s ease-out both',
        'fade-in-fast': 'fadeIn 0.18s ease-out both',
        'slide-in': 'slideIn 0.35s cubic-bezier(.22,1,.36,1) both',
        'slide-up': 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
        'slide-right': 'slideRight 0.35s cubic-bezier(.22,1,.36,1) both',
        'scale-in': 'scaleIn 0.25s cubic-bezier(.22,1,.36,1) both',
        'scale-in-fast': 'scaleIn 0.15s cubic-bezier(.22,1,.36,1) both',
        /* Stagger helpers */
        'stagger-1': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.05s both',
        'stagger-2': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.1s both',
        'stagger-3': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.15s both',
        'stagger-4': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.2s both',
        'stagger-5': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.25s both',
        'stagger-6': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.3s both',
        /* Skeleton */
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        /* Contínuas */
        float: 'float 3s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        /* Page */
        'page-enter': 'pageEnter 0.4s cubic-bezier(.22,1,.36,1) both',
        'drawer-in': 'drawerIn 0.35s cubic-bezier(.22,1,.36,1) both',
        'drawer-out': 'drawerOut 0.3s ease-in both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(-12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fadeUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-468px 0' },
          '100%': { backgroundPosition: '468px 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        pageEnter: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        drawerIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        drawerOut: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.22,1,.36,1)',
        'out-expo': 'cubic-bezier(0.16,1,0.3,1)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config
