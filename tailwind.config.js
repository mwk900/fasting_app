/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        fg: 'var(--color-fg)',
        teal: '#00D4C8',
        card: 'var(--color-card)',
        'card-border': 'var(--color-card-border)',
        secondary: 'var(--color-secondary)',
        muted: 'var(--color-muted)',
        dim: 'var(--color-dim)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
