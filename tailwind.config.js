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
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'inherit',
            // Add global text wrapping for all content
            overflowWrap: 'break-word',
            wordWrap: 'break-word',
            hyphens: 'auto',
            // Ensure all code blocks wrap properly
            'pre, code': {
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            },
            // Reduce paragraph spacing
            p: {
              marginTop: '0.75em',
              marginBottom: '0.75em',
            },
            // Better heading spacing
            'h1, h2, h3, h4, h5, h6': {
              marginTop: '1.5em',
              marginBottom: '0.75em',
            },
            // Specific heading spacing adjustments
            h2: {
              marginTop: '6em', // Much more space before major section headings
              marginBottom: '1.5em',
              paddingTop: '2em', // Add significant padding at the top
              fontWeight: '700',
              lineHeight: '1.3',
              position: 'relative',
            },
            // Reduce list spacing
            'ul, ol': {
              marginTop: '0.75em',
              marginBottom: '0.75em',
            },
            li: {
              marginTop: '0.25em',
              marginBottom: '0.25em',
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
            // Target inline code specifically (not in pre blocks)
            ':not(pre) > code': {
              backgroundColor: '#f3f4f6', // Light gray background for light mode
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
              fontWeight: '700', // Slightly bolder
              color: '#1f2937', // Darker text for contrast
            },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
            'blockquote p:first-of-type::before': { content: '""' },
            'blockquote p:last-of-type::after': { content: '""' },
            // Hide horizontal rules completely as we use heading styles for section breaks
            hr: {
              display: 'none',
            },
            // Reduce blockquote spacing
            blockquote: {
              marginTop: '0.75em',
              marginBottom: '0.75em',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
