/**
 * Mock for next/image
 */
const React = require("react");

module.exports = {
  __esModule: true,
  default: (props) => {
    const { src, alt, priority, fill, ...rest } = props;
    return React.createElement("img", {
      src,
      alt,
      "data-testid": "next-image-mock",
      "data-priority": priority ? "true" : "false",
      "data-fill": fill ? "true" : "false",
      ...rest,
    });
  },
};
