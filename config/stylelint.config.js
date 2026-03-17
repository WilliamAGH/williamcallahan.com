/** @type {import('stylelint').Config} */
/**
 * Stylelint Configuration (2025)
 *
 * @see https://stylelint.io/
 */
export default {
  fix: true,
  extends: ["stylelint-config-recommended", "stylelint-config-tailwindcss"],
  rules: {
    "declaration-no-important": true,
    "selector-max-specificity": "1,5,0",
    "selector-max-compound-selectors": 4,
    "comment-no-empty": true,
    "property-no-vendor-prefix": null,
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["tailwind", "apply", "variants", "responsive", "screen", "layer"],
      },
    ],
    "selector-class-pattern": null,
  },
};
