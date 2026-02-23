/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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

