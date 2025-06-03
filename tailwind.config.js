/** @type {import('tailwindcss').Config} */
import typographyPlugin from '@tailwindcss/typography';

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './data/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  darkMode: 'class',
  future: {
    hoverOnlyWhenSupported: true,
    respectDefaultRingColorOpacity: true,
    disableColorOpacityUtilitiesByDefault: true,
    relativeContentPathsByDefault: true,
  },
  theme: {
    extend: {
      fontFamily: {
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'inherit',
            overflowWrap: 'break-word',
            wordWrap: 'break-word',
            hyphens: 'none',
            p: {
              marginTop: '0.75em',
              marginBottom: '0.75em',
              fontSize: '16px',
            },
            'h1, h2, h3, h4, h5, h6': {
              marginTop: '1.5em',
              marginBottom: '0.75em',
            },
            h2: {
              marginTop: '3em',
              marginBottom: '1em',
              paddingTop: '1em',
              fontWeight: '700',
              lineHeight: '1.3',
              position: 'relative',
              '@screen md': {
                marginTop: '4em',
                paddingTop: '1.5em',
              },
            },
            'ul, ol': {
              marginTop: '0.75em',
              marginBottom: '0.75em',
              fontSize: '16px',
            },
            li: {
              marginTop: '0.25em',
              marginBottom: '0.25em',
              fontSize: '16px',
            },
            a: {
              color: 'inherit',
              textDecoration: 'underline',
              fontWeight: '500',
              '&:hover': {
                color: 'inherit',
                textDecoration: 'none',
              },
            },
            ':not(pre) > code': {
              backgroundColor: '#f3f4f6',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '700',
              color: '#1f2937',
            },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            'blockquote p:first-of-type::before': { content: '""' },
            'blockquote p:last-of-type::after': { content: '""' },
            hr: {
              display: 'none',
            },
            blockquote: {
              marginTop: '0.75em',
              marginBottom: '0.75em',
              fontSize: '16px',
            },
          },
        },
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.4)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        pop: 'pop 0.4s ease-out',
      },
    },
  },
  plugins: [
    typographyPlugin,
  ],
};