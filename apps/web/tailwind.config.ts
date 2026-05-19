import type { Config } from 'tailwindcss';

/**
 * Tailwind 颜色 token 直接绑定到 globals.css 的设计变量，
 * shadcn 原语（bg-primary / text-card-foreground / ...）
 * 与设计 CSS（var(--bg-*) / var(--st-*)）共享同一套 token，
 * 主题切换通过 [data-theme="light|dark"] 一键完成。
 */
const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        background: 'var(--bg)',
        foreground: 'var(--fg)',
        border: 'var(--border)',
        input: 'var(--border)',
        ring: 'var(--ring)',
        primary: {
          DEFAULT: 'var(--brand)',
          foreground: 'var(--brand-fg)',
        },
        secondary: {
          DEFAULT: 'var(--bg-subtle)',
          foreground: 'var(--fg)',
        },
        destructive: {
          DEFAULT: 'var(--st-major)',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: 'var(--bg-subtle)',
          foreground: 'var(--fg-muted)',
        },
        accent: {
          DEFAULT: 'var(--bg-subtle)',
          foreground: 'var(--fg)',
        },
        popover: {
          DEFAULT: 'var(--bg-elevated)',
          foreground: 'var(--fg)',
        },
        card: {
          DEFAULT: 'var(--bg-elevated)',
          foreground: 'var(--fg)',
        },
        st: {
          op: 'var(--st-op)',
          deg: 'var(--st-deg)',
          part: 'var(--st-part)',
          major: 'var(--st-major)',
          maint: 'var(--st-maint)',
          mon: 'var(--st-mon)',
          unknown: 'var(--st-unknown)',
        },
        status: {
          operational: 'var(--st-op)',
          degraded: 'var(--st-deg)',
          partial: 'var(--st-part)',
          major: 'var(--st-major)',
          maintenance: 'var(--st-maint)',
        },
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius)',
        sm: 'var(--radius-sm)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require('tailwindcss-animate')],
};

export default config;
