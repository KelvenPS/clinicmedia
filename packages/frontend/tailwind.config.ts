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
        /* ── Entradas ── */
        'fade-in': 'fadeIn 0.35s ease-out both',
        'fade-in-fast': 'fadeIn 0.18s ease-out both',
        'fade-in-slow': 'fadeIn 0.6s ease-out both',
        'slide-in': 'slideIn 0.35s cubic-bezier(.22,1,.36,1) both',
        'slide-up': 'slideUp 0.4s cubic-bezier(.22,1,.36,1) both',
        'slide-down': 'slideDown 0.35s cubic-bezier(.22,1,.36,1) both',
        'slide-right': 'slideRight 0.35s cubic-bezier(.22,1,.36,1) both',
        'slide-left': 'slideLeft 0.35s cubic-bezier(.22,1,.36,1) both',
        'scale-in': 'scaleIn 0.25s cubic-bezier(.22,1,.36,1) both',
        'scale-in-fast': 'scaleIn 0.15s cubic-bezier(.22,1,.36,1) both',
        'zoom-in': 'zoomIn 0.3s cubic-bezier(.22,1,.36,1) both',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(.22,1,.36,1) both',
        /* ── Stagger helpers ── */
        'stagger-1': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.05s both',
        'stagger-2': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.10s both',
        'stagger-3': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.15s both',
        'stagger-4': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.20s both',
        'stagger-5': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.25s both',
        'stagger-6': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.30s both',
        'stagger-7': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.35s both',
        'stagger-8': 'fadeUp 0.4s cubic-bezier(.22,1,.36,1) 0.40s both',
        /* ── Skeleton ── */
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        /* ── Contínuas ── */
        float: 'float 3s ease-in-out infinite',
        'float-slow': 'float 5s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'pulse-scale': 'pulseScale 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'spin-very-slow': 'spin 8s linear infinite',
        /* ── Page ── */
        'page-enter': 'pageEnter 0.4s cubic-bezier(.22,1,.36,1) both',
        'page-exit': 'pageExit 0.25s ease-in both',
        'drawer-in': 'drawerIn 0.35s cubic-bezier(.22,1,.36,1) both',
        'drawer-out': 'drawerOut 0.3s ease-in both',
        /* ── Indicadores ── */
        'ping-once': 'pingOnce 0.6s ease-out both',
        'progress-fill': 'progressFill 0.8s cubic-bezier(.22,1,.36,1) both',
        'count-up': 'fadeIn 0.5s ease-out both',
        /* ── Notificações ── */
        'notification-in': 'notificationIn 0.35s cubic-bezier(.22,1,.36,1) both',
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
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        zoomIn: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)', opacity: '0.8' },
          '70%': { transform: 'scale(0.95)', opacity: '1' },
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
          '50%': { opacity: '0.55' },
        },
        pulseScale: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
        },
        pageEnter: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pageExit: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-8px)' },
        },
        drawerIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        drawerOut: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        pingOnce: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '75%': { transform: 'scale(1.8)', opacity: '0.4' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
        progressFill: {
          '0%': { width: '0%' },
        },
        notificationIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.22,1,.36,1)',
        'out-expo': 'cubic-bezier(0.16,1,0.3,1)',
        'in-back': 'cubic-bezier(0.36,0,0.66,-0.56)',
        smooth: 'cubic-bezier(0.4,0,0.2,1)',
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
        '400': '400ms',
        '600': '600ms',
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
      },
      boxShadow: {
        'card-hover': '0 8px 24px -4px rgba(0,0,0,0.08)',
        'blue-glow': '0 4px 20px -4px rgba(37,99,235,0.35)',
        'cyan-glow': '0 4px 20px -4px rgba(6,182,212,0.35)',
        'emerald-glow': '0 4px 20px -4px rgba(16,185,129,0.3)',
        'inner-sm': 'inset 0 1px 3px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config
