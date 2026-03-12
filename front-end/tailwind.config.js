/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Official Solace Brand Colors (from solace.com)
        'solace-green': {
          DEFAULT: '#00C895',  // Primary brand color
          light: '#33D4AC',
          dark: '#00A077',
          50: '#E5F9F3',
          100: '#B3EED9',
          200: '#80E4C0',
          300: '#4DD9A6',
          400: '#1ACF8D',
          500: '#00C895',
          600: '#00A077',
          700: '#007859',
          800: '#00503B',
          900: '#00281E'
        },
        'solace-dark': {
          DEFAULT: '#20262a',  // Dark backgrounds from solace.com
          darker: '#191f23',   // Deeper dark backgrounds
        },
        'solace-gray': {
          DEFAULT: '#EDF0F3',  // Light gray
          light: '#f9f9f9',    // Off-white
          medium: '#cccccc',   // Borders
        },
        'solace-blue': {
          DEFAULT: '#0073DB',
          light: '#338FE3',
          dark: '#005AAB',
          50: '#E5F2FC',
          100: '#B3D9F7',
          200: '#80C0F1',
          300: '#4DA7EC',
          400: '#1A8EE6',
          500: '#0073DB',
          600: '#005AAB',
          700: '#00427B',
          800: '#002B4C',
          900: '#00131E'
        },
        'solace-red': {
          DEFAULT: '#E74C3C',
          light: '#EC7063',
          dark: '#C0392B',
          50: '#FDEDEC',
          100: '#FADBD8',
          200: '#F5B7B1',
          300: '#F1948A',
          400: '#EC7063',
          500: '#E74C3C',
          600: '#CB4335',
          700: '#B03A2E',
          800: '#943126',
          900: '#78281F'
        },
        'solace-yellow': {
          DEFAULT: '#F39C12',
          light: '#F5B041',
          dark: '#D68910'
        }
      }
    },
  },
  plugins: [],
}
