/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      colors: {
        kg: {
          bg: 'var(--kg-bg)',
          surface: 'var(--kg-surface)',
          'surface-soft': 'var(--kg-surface-soft)',
          'surface-2': 'var(--kg-surface-2)',
          primary: 'var(--kg-primary)',
          'primary-fg': 'var(--kg-primary-fg)',
          'primary-ink': 'var(--kg-primary-ink)',
          'primary-hover': 'var(--kg-primary-hover)',
          'primary-soft': 'var(--kg-primary-soft)',
          accent: 'var(--kg-accent)',
          'accent-fg': 'var(--kg-accent-fg)',
          'accent-ink': 'var(--kg-accent-ink)',
          'accent-soft': 'var(--kg-accent-soft)',
          'nav-active': 'var(--kg-nav-active)',
          'nav-active-fg': 'var(--kg-nav-active-fg)',
          'rail-bg': 'var(--kg-rail-bg)',
          'rail-bg-alt': 'var(--kg-rail-bg-alt)',
          'rail-text': 'var(--kg-rail-text)',
          'rail-muted': 'var(--kg-rail-muted)',
          success: 'var(--kg-success)',
          'success-soft': 'var(--kg-success-soft)',
          warning: 'var(--kg-warning)',
          'warning-soft': 'var(--kg-warning-soft)',
          danger: 'var(--kg-danger)',
          'danger-soft': 'var(--kg-danger-soft)',
          info: 'var(--kg-info)',
          'info-soft': 'var(--kg-info-soft)',
          border: 'var(--kg-border)',
          'border-strong': 'var(--kg-border-strong)',
          text: 'var(--kg-text)',
          'text-muted': 'var(--kg-text-muted)',
          'text-soft': 'var(--kg-text-soft)',
        },
        ocean: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e'
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.88)',
          dark: 'rgba(19, 24, 34, 0.88)',
          border: 'rgba(228, 228, 231, 0.8)',
          borderDark: 'rgba(255, 255, 255, 0.1)',
        }
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        soft: 'var(--shadow-soft)',
        hero: 'var(--shadow-hero)',
      },
      animation: {
        'fade-in': 'fadeIn 0.16s cubic-bezier(0.2, 0, 0, 1)',
        'slide-up': 'slideUp 0.18s cubic-bezier(0.2, 0, 0, 1)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'none', opacity: '1' } },
      }
    },
  },
  plugins: [],
}
