module.exports = {
  plugins: {
    'tailwindcss/nesting': {},
    'tailwindcss': {},
    'autoprefixer': {
      flexbox: 'no-2009'
    },
    'postcss-preset-env': {
      stage: 3,
      features: {
        'nesting-rules': true,
        'custom-properties': false,
        'is-pseudo-class': false // Disable transformation of :is() to prevent warnings
      },
      browsers: [
        'defaults',
        'not IE 11'
      ]
    }
  }
}