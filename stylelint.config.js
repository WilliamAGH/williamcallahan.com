/** @type {import('stylelint').Config} */
export default {
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
    'property-no-vendor-prefix': null
  }
};