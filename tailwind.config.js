/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html","./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: '#0e0f12', surface: '#16181d', surface2: '#1d2028', surface3: '#252830',
        border: '#2a2d36', accent: '#f0b429', blue: '#4a9eff', green: '#22c55e',
        red: '#ef4444', purple: '#a855f7', text: '#e8eaf0', text2: '#8b90a0', text3: '#555a6a',
      },
      fontFamily: {
        sans: ['DM Sans','sans-serif'],
        mono: ['DM Mono','monospace'],
        display: ['Syne','sans-serif'],
      },
    },
  },
  plugins: [],
}
