/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
    './src/shared/**/*.{ts,tsx}',
    './src/styles/**/*.css',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        obsidian: {
          bg: 'rgb(var(--obsidian-bg) / <alpha-value>)',
          sidebar: 'rgb(var(--obsidian-sidebar) / <alpha-value>)',
          border: 'rgb(var(--obsidian-border) / <alpha-value>)',
          accent: 'rgb(var(--obsidian-accent) / <alpha-value>)',
          text: 'rgb(var(--obsidian-text) / <alpha-value>)',
          muted: 'rgb(var(--obsidian-muted) / <alpha-value>)',
          active: 'rgb(var(--obsidian-active) / <alpha-value>)',
          strong: 'rgb(var(--obsidian-strong) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
