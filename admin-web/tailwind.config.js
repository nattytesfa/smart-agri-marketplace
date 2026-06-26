/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontVariationSettings: {
        'filled': "'FILL' 1",
        'thin': "'wght' 100",
    },
  },
   plugins: [
    function ({ addUtilities, theme }) {
      const newUtilities = {
        '.icon-filled': { 'font-variation-settings': "'FILL' 1" },
        '.icon-thin': { 'font-variation-settings': "'wght' 100" },
      }
      addUtilities(newUtilities)
    }
  ],
}};
