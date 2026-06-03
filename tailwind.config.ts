import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        'dashboard-bg': '#0f0f12',
        'card-bg': '#18181b',
        'sidebar-bg': '#121214',
        'accent-blue': '#3b82f6',
        'border-subtle': '#27272a',
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
