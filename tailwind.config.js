/** @type {import('tailwindcss').Config} */
module.exports = {
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
            // Add global text wrapping for all content
            overflowWrap: 'break-word',
            wordWrap: 'break-word',
            hyphens: 'auto',
            // Removed 'pre, code' block to resolve potential parsing error
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
              marginTop: '3em', // Less space on smaller screens (will be enhanced by component)
              marginBottom: '1em',
              paddingTop: '1em', // Reduced padding for mobile
              fontWeight: '700',
              lineHeight: '1.3',
              position: 'relative',
              '@screen md': {
                marginTop: '4em', // More space on larger screens
                paddingTop: '1.5em',
              },
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
  // Remove the safelist that's causing warnings
  // safelist: [
  //   {
  //     pattern: /^(token|language-|line-numbers|data-line-)/, // Matches Prism classes and line number related classes if added later
  //   },
  // ],
}
