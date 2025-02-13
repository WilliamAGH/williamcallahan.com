/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './data/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          light: 'rgb(255, 255, 255)',
          dark: 'rgb(10, 10, 10)'
        },
        foreground: {
          light: 'rgb(10, 10, 10)',
          dark: 'rgb(255, 255, 255)'
        }
      },
      backgroundColor: {
        DEFAULT: 'var(--background)',
        dark: 'var(--background-dark)',
        terminal: {
          light: 'rgb(255, 255, 255)',
          dark: 'rgb(26, 27, 38)'
        }
      },
      textColor: {
        DEFAULT: 'var(--foreground)',
        dark: 'var(--foreground-dark)'
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'inherit',
            backgroundColor: 'inherit',
            a: {
              color: 'inherit',
              textDecoration: 'underline',
              fontWeight: '500',
              '&:hover': {
                color: 'inherit',
                textDecoration: 'none',
              },
            },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            'blockquote p:first-of-type::before': { content: '""' },
            'blockquote p:last-of-type::after': { content: '""' },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
