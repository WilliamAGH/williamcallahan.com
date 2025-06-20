/**
 * SVG Transform Fix Utilities
 *
 * Functions to fix SVG transform attributes that cause errors
 * in the browser when not properly formatted.
 *
 * USAGE:
 * 1. For client components: Import and use the SvgTransformFixer component
 * 2. For specific elements: Use the useFixSvgTransforms hook
 * 3. For direct usage: Call processSvgTransforms(yourSvgElement)
 *
 */

/**
 * Fixes a SVG transform attribute string to ensure it uses parentheses
 * when needed.
 *
 * @param {string} transform - The transform attribute value to fix
 * @returns {string} - Fixed transform value
 *
 * Example:
 * // Fixes "translate10,20" to "translate(10,20)"
 * const fixed = fixSvgTransform("translate10,20");
 */
export function fixSvgTransform(transform: string): string {
  if (!transform) return transform;

  // If already has parentheses, it's likely correct
  if (transform.includes("(")) return transform;

  // Common transform functions that need parentheses
  const transformFunctions = [
    "translate",
    "translateX",
    "translateY",
    "scale",
    "scaleX",
    "scaleY",
    "rotate",
    "skew",
    "skewX",
    "skewY",
    "matrix",
  ];

  // Check if the transform starts with any of the transform functions
  for (const func of transformFunctions) {
    if (transform.startsWith(func)) {
      // Extract the value part (e.g., from "translateY0.5px" get "0.5px")
      const valueMatch = transform.match(new RegExp(`^${func}(.*)`));
      if (valueMatch?.[1]) {
        return `${func}(${valueMatch[1]})`;
      }
    }
  }

  // If it doesn't match any known pattern, return as is
  return transform;
}

/**
 * Process an SVG element to fix all transform attributes.
 * Can be applied to SVG strings or DOM elements.
 *
 * @param {string|SVGElement} svg - SVG content or element to process
 * @returns {string|void} - Fixed SVG string or void if element was processed
 *
 * Examples:
 * // For DOM elements:
 * const svgElement = document.querySelector('svg');
 * processSvgTransforms(svgElement);
 *
 * // For SVG strings:
 * const fixedSvgString = processSvgTransforms('<svg transform="translate10,20"></svg>');
 *
 * @see {@link components/utils/svg-transform-fixer.client} For automatic fixing
 * @see {@link hooks/use-fix-svg-transforms} For React hook-based fixing
 */
export function processSvgTransforms(svg: string | SVGElement): string | undefined {
  // If it's a DOM element
  if (typeof svg !== "string") {
    // Fix transform on the SVG element itself
    if (svg.hasAttribute("transform")) {
      const transform = svg.getAttribute("transform");
      if (transform) {
        svg.setAttribute("transform", fixSvgTransform(transform));
      }
    }

    // Fix transforms on all child elements
    const elements = svg.querySelectorAll("*[transform]");
    for (const el of elements) {
      const transform = el.getAttribute("transform");
      if (transform) {
        el.setAttribute("transform", fixSvgTransform(transform));
      }
    }

    return;
  }

  // For string input, use regex to replace transform attributes
  return svg.replace(/transform="([^"]+)"/g, (_match: string, transform: string) => {
    return `transform="${fixSvgTransform(transform)}"`;
  });
}
