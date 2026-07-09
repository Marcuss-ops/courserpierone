import type { Config } from "tailwindcss";

const config: Config = {
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
        // Warm dark mode (premium dark) — base + accents for dark surfaces
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
      }
    },
  },
  plugins: [],
};

export default config;
