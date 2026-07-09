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
