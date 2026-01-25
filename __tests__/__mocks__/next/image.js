/**
 * Mock for next/image
 *
 * Extracts Next.js-specific Image props to prevent React warnings about
 * non-standard attributes being passed to native <img> elements.
 */
const React = require("react");

module.exports = {
  __esModule: true,
  default: props => {
    const {
      src,
      alt,
      priority,
      fill,
      // Next.js-specific props (not valid HTML attributes) - prefixed with _ to indicate intentional exclusion
      unoptimized,
      quality: _quality,
      placeholder: _placeholder,
      blurDataURL: _blurDataURL,
      loader: _loader,
      onLoadingComplete: _onLoadingComplete,
      ...rest
    } = props;
    return React.createElement("img", {
      src,
      alt,
      "data-testid": "next-image-mock",
      "data-priority": priority ? "true" : "false",
      "data-fill": fill ? "true" : "false",
      "data-unoptimized": unoptimized ? "true" : "false",
      ...rest,
    });
  },
};
