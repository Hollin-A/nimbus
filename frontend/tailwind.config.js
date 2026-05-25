/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#5138EE',
          hover: '#3F2BC9',
          soft: '#ECEAFE',
        },
        lavender: '#F5F3FE',
        ink: '#141125',
        body: '#5B5675',
        muted: '#8A86A0',
        cyan: '#5EC6E8',
        border: '#E7E6F0',
        severity: {
          'info-text': '#2563EB',
          'info-bg': '#E8EFFD',
          'warning-text': '#B45309',
          'warning-bg': '#FDF1DD',
          'alert-text': '#DC2626',
          'alert-bg': '#FCE9E9',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '18px',
        input: '10px',
        toast: '16px',
      },
    },
  },
  plugins: [],
};
