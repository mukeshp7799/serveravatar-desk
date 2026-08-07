/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#4F46E5', 50: '#EEF2FF', 100: '#E0E7FF', 500: '#4F46E5', 600: '#4338CA', 700: '#3730A3' },
        secondary: { DEFAULT: '#10B981', 50: '#ECFDF5', 500: '#10B981', 600: '#059669' },
        danger: { DEFAULT: '#EF4444', 500: '#EF4444', 600: '#DC2626' },
        warning: { DEFAULT: '#F59E0B', 500: '#F59E0B' },
        'chat-bg': '#efeae2',
        'chat-bg-dark': '#111b21',
        'chat-input-dark': '#222f3e',
      },
    },
  },
  plugins: [require('tailwind-scrollbar')],
}
