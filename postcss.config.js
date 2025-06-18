/**
 * PostCSS Configuration
 * Defines PostCSS plugins and settings for the build process
 */

export default {
  plugins: {
    "tailwindcss/nesting": {},
    "tailwindcss": {
      config: "./config/tailwind.config.js",
    },
    "autoprefixer": {
      flexbox: "no-2009",
      grid: true,
      // Suppress common warnings that don't affect functionality
      ignoreUnknownVersions: true,
      // Configure grid support to reduce warnings
      supports: false,
    },
    "postcss-preset-env": {
      stage: 2,
      features: {
        "nesting-rules": true,
        "custom-properties": false,
        "is-pseudo-class": false,
        "custom-media-queries": true,
        "gap-properties": true,
        "logical-properties-and-values": true,
      },
      browsers: ["> 1%", "last 2 versions", "not ie <= 8"],
      autoprefixer: {
        grid: true,
      },
    },
  },
}; 