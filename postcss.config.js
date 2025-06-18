/**
 * PostCSS Configuration for Next.js (2025)
 * Modern configuration that follows Next.js best practices
 * @see https://nextjs.org/docs/pages/guides/post-css
 */

export default {
  plugins: {
    // Tailwind CSS nesting support
    "tailwindcss/nesting": {},
    
    // Tailwind CSS
    "tailwindcss": {
      config: "./config/tailwind.config.js",
    },
    
    // Autoprefixer with modern browser support
    "autoprefixer": {
      // Support flexbox (IE10+) but not IE9 flexbox
      flexbox: "no-2009",
      // Disable grid autoplacement warnings for third-party CSS
      grid: false,
    },
    
    // PostCSS Preset Env for modern CSS features
    "postcss-preset-env": {
      // Stage 3 features (stable)
      stage: 3,
      features: {
        // Disable custom properties (CSS variables) polyfill
        "custom-properties": false,
        // Enable nesting rules
        "nesting-rules": true,
      },
      // Modern browser support (no IE11)
      browsers: ["> 0.5%", "last 2 versions", "not dead", "not IE 11"],
    },
  },
}; 