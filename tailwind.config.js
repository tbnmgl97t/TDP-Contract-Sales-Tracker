/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0faf5',
          100: '#d9f2e6',
          200: '#b3e5cd',
          300: '#7dd0af',
          400: '#57BB95',
          500: '#3da87e',
          600: '#2e8f68',
          700: '#257355',
          800: '#1e5c44',
          900: '#194d39',
        },
        navy: {
          50: '#f0f3f8',
          100: '#dde3ed',
          200: '#bec9db',
          300: '#94a7c3',
          400: '#6380a8',
          500: '#43618f',
          600: '#334e77',
          700: '#2a3f61',
          800: '#243450',
          900: '#17263A',
          950: '#0f1a28',
        },
        accent: {
          50: '#f9fce8',
          100: '#f1f8cd',
          200: '#e4f09d',
          300: '#d0e362',
          400: '#CBDD56',
          500: '#b3c832',
          600: '#8ea024',
          700: '#6b7a1e',
          800: '#56611d',
          900: '#47521c',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'tdp-gradient': 'linear-gradient(135deg, #57BB95 0%, #CBDD56 100%)',
      },
    },
  },
  plugins: [],
}
