import type { Config } from "tailwindcss";

const config: Config = {
  // next-themes: dark-class strategy. Adds `dark:` variants that activate
  // when <html class="dark"> is set by ThemeProvider (src/components/providers/theme-provider.tsx).
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Legacy dark theme tokens (kept for admin shell)
        'dashboard-bg': '#0f0f12',
        'card-bg': '#18181b',
        'sidebar-bg': '#121214',
        'accent-blue': '#3b82f6',
        'border-subtle': '#27272a',
        // Modern warm cream tokens (used by login, dashboard, future pages)
        cream: {
          bg: '#FAFAF8',
          card: '#FFFFFF',
          border: '#E8E3DA',
          input: '#FFFCF7',
          'border-soft': '#F5F0E8',
          text: '#1B1B19',
          'text-soft': '#6B6A65',
          espresso: '#2A1800',
          gold: '#8B6914',
          peach: '#FFC882',
          orange: '#A0521A',
        },
        // Warm dark mode (premium dark) — base + accents for dark surfaces.
        // `cream-dark-*` tokens serve a DUAL purpose in this app:
        //   1. Always-on premium look on cream-dark-themed pages
        //      (course area, account layout, dashboard, /about, /chat).
        //   2. Target of `dark:` variants on light pages that flip to the
        //      premium dark surface when the user toggles theme → dark
        //      (footer, login, user-nav dropdown, error pages).
        'cream-dark': {
          bg: '#1A1208',         // deep warm dark — like dark chocolate
          surface: '#221A10',     // slightly lighter for cards-on-dark
          border: '#3A2D1E',      // subtle warm border on dark
          text: '#FFF8F0',        // warm cream for text on dark
          'text-soft': '#C9B896', // muted warm for secondary text on dark
          gold: '#FFC882',        // brighter peach-gold for dark visibility
          orange: '#FF8C42',      // bright orange for CTAs on dark
          glow: 'rgba(255, 140, 66, 0.18)', // warm orange glow overlay
        },
      },
      fontFamily: {
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        fadeIn: 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      }
    },
  },
  plugins: [],
};

export default config;
