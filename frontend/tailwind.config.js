/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0E1220',
        panel: '#161B2E',
        panel2: '#1D2440',
        border: '#2A3153',
        amber: {
          DEFAULT: '#F5B301',
          dim: '#8A6A1F',
        },
        teal: {
          DEFAULT: '#34D8C6',
          dim: '#1B7A70',
        },
        coral: '#FF6B5E',
        ink: {
          DEFAULT: '#EDEFF7',
          muted: '#8891AC',
          faint: '#525A78',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
