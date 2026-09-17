/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sarabun', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ธีมขาว–ฟ้าของวิทยาลัย
        brand: {
          50:  '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc7fb',
          400: '#36aaf5',
          500: '#0c8ee7',
          600: '#0070c5',
          700: '#0159a0',
          800: '#064c84',
          900: '#0a406e',
          950: '#072949',
        },
      },
      borderRadius: { xl: '0.875rem' },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08)' },
    },
  },
  plugins: [],
}
