import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        accent: '#00ff88',
        'accent-dim': '#00cc6a',
        'bg-dark': '#0a0e1a',
        'bg-card': '#0f1628',
        'bg-border': '#1a2540',
        'text-primary': '#e2e8f0',
        'text-secondary': '#8892a4',
      },
    },
  },
  plugins: [],
};

export default config;
