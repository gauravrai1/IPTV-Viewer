/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f0f13',
          card: '#16161f',
          elevated: '#1e1e2a',
          border: '#2a2a3a',
        },
      },
    },
  },
  plugins: [],
};
