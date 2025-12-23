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
          bg: '#1e1e1e',
          sidebar: '#111111',
          border: '#333333',
          accent: '#7c3aed',
          text: '#dcddde',
          muted: '#8e8e8e',
          active: '#2f2f2f',
        },
      },
    },
  },
  plugins: [],
};
