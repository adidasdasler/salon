/** SALON shared Tailwind preset — brand palette used by all apps. */
module.exports = {
  darkMode: 'class',
  content: [],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f0ff',
          100: '#e7e3ff',
          200: '#d1caff',
          300: '#b1a4ff',
          400: '#8f7cf7',
          500: '#7c58ef',
          600: '#6d3fe4',
          700: '#5d2fc9',
          800: '#4c28a3',
          900: '#402584',
          950: '#271557',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.05), 0 4px 24px -6px rgba(76,40,163,.10)',
      },
    },
  },
  plugins: [],
};
