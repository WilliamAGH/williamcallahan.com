/**
 * CONSOLIDATED TOOL CONFIGURATION
 * 
 * Master configuration file that consolidates settings for multiple tools.
 * This reduces config file proliferation and provides a single source of truth.
 */

// Shared constants
const SUPPORTED_BROWSERS = [
  '> 1%',
  'last 2 versions',
  'not ie <= 8',
];

const TAILWIND_AT_RULES = [
  'tailwind',
  'apply',
  'variants',
  'responsive',
  'screen',
  'layer',
];

const PROJECT_GLOBALS = {
  // Shared globals that might be used across tools
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  TARGET_ES: 'es2022',
};

export const masterConfig = {
  // Project metadata
  project: {
    name: 'william-callahan-dot-com',
    target: PROJECT_GLOBALS.TARGET_ES,
    environment: PROJECT_GLOBALS.NODE_ENV,
  },

  // PostCSS configuration
  postcss: {
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
        browsers: SUPPORTED_BROWSERS.concat(['not IE 11']),
        autoprefixer: {
          grid: true
        }
      }
    }
  },

  // Stylelint configuration  
  stylelint: {
    // Enable automatic fixes for fixable rules
    fix: true,
    extends: [
      'stylelint-config-recommended',
      'stylelint-config-tailwindcss'
    ],
    rules: {
      'declaration-no-important': true,
      'selector-max-specificity': '1,5,0',
      'selector-max-compound-selectors': 4,
      'comment-no-empty': true,
      'property-no-vendor-prefix': null,
      'at-rule-no-unknown': [
        true,
        {
          ignoreAtRules: TAILWIND_AT_RULES,
        },
      ],
      'selector-class-pattern': null, // Allow Tailwind classes
    },
  },

  // Browserslist configuration
  browserslist: SUPPORTED_BROWSERS,

  // Build configuration shared across tools
  build: {
    target: PROJECT_GLOBALS.TARGET_ES,
    sourcemap: !PROJECT_GLOBALS.IS_PRODUCTION,
    minify: PROJECT_GLOBALS.IS_PRODUCTION,
  },

  // Shared file patterns for tools
  patterns: {
    source: ['**/*.{js,jsx,ts,tsx}'],
    tests: ['**/?(*.)+(spec|test).{js,jsx,ts,tsx}'],
    configs: ['**/*.config.{js,ts,mjs,cjs}'],
    markdown: ['**/*.{md,mdx}'],
    styles: ['**/*.{css,scss,sass}'],
  },

  // Common ignore patterns
  ignores: {
    build: ['.next/**', 'out/**', 'dist/**'],
    deps: ['node_modules/**'],
    cache: ['.cache/**', '*.tsbuildinfo'],
    logs: ['*.log', 'logs/**'],
    temp: ['.tmp/**', '.temp/**'],
  },
};

// Export individual configs for tools that need them
export const { postcss, stylelint, browserslist, build, patterns, ignores } = masterConfig;

// Default export for tools that import the whole config
export default masterConfig; 