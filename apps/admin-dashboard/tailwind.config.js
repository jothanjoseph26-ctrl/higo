/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primaryGreen: '#0B6E4F',
        darkNavy: '#0A2540',
        accentOrange: '#FF7A00',
        lightGrey: '#F2F4F7',
        dark: '#222222',
        success: '#16A34A',
        error: '#DC2626',
        warning: '#F59E0B',
      },
      borderRadius: {
        card: '16px',
        input: '12px',
        button: '28px',
      },
      boxShadow: {
        custom: '0 4px 24px rgba(10,37,64,0.13)',
      },
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
