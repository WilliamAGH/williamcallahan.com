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
            // Reduce HR margins
            hr: {
              marginTop: '1.5em', // Default is often larger
              marginBottom: '1.5em', // Default is often larger
              borderColor: 'inherit', // Ensure border color respects theme
            },
          },
        },
        // Add dark mode specific styles for inline code if needed
        // dark: {
        //   css: {
        //     ':not(pre) > code': {
        //       backgroundColor: 'rgba(255, 255, 255, 0.1)', // Example dark mode style
        //       color: '#e5e7eb',
        //     },
        //   },
        // },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
