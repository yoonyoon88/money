/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        slideUp: {
          from: { transform: 'translate(-50%, 100%)' },
          to: { transform: 'translate(-50%, 0%)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        slideUp: 'slideUp 0.3s ease-out',
        fadeIn: 'fadeIn 0.4s ease-out forwards',
      },
      colors: {
        'pastel-green': '#B8E6B8',
        'pastel-orange': '#FFD4A3',
        'soft-green': '#A8D8A8',
        'soft-orange': '#FFC896',
      },
    },
  },
  plugins: [],
}

