module.exports = {
  plugins: {
    'tailwindcss/nesting': {},
    'tailwindcss': {},
    'autoprefixer': {
      flexbox: 'no-2009',
      grid: true
    },
    'postcss-preset-env': {
      stage: 2,
      features: {
        'nesting-rules': true,
        'custom-properties': false,
        'is-pseudo-class': false,
        'custom-media-queries': true,
        'gap-properties': true,
        'logical-properties-and-values': true
      },
      browsers: [
        'defaults',
        'not IE 11'
      ],
      autoprefixer: {
        grid: true
      }
    }
  }
}