/**
 * SVG Transform Fix Utilities
 *
 * Functions to fix SVG transform attributes that cause errors
 * in the browser when not properly formatted.
 */

/**
 * Fixes a SVG transform attribute string to ensure it uses parentheses
 * when needed.
 *
 * @param {string} transform - The transform attribute value to fix
 * @returns {string} - Fixed transform value
 */
export function fixSvgTransform(transform: string): string {
  if (!transform) return transform;

  // If already has parentheses, it's likely correct
  if (transform.includes('(')) return transform;

  // Common transform functions that need parentheses
  const transformFunctions = [
    'translate', 'translateX', 'translateY',
    'scale', 'scaleX', 'scaleY',
    'rotate', 'skew', 'skewX', 'skewY',
    'matrix'
  ];

  // Check if the transform starts with any of the transform functions
  for (const func of transformFunctions) {
    if (transform.startsWith(func)) {
      // Extract the value part (e.g., from "translateY0.5px" get "0.5px")
      const valueMatch = transform.match(new RegExp(`^${func}(.*)`));
      if (valueMatch && valueMatch[1]) {
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
 */
export function processSvgTransforms(svg: string | SVGElement): string | void {
  // If it's a DOM element
  if (typeof svg !== 'string') {
    // Fix transform on the SVG element itself
    if (svg.hasAttribute('transform')) {
      const transform = svg.getAttribute('transform');
      if (transform) {
        svg.setAttribute('transform', fixSvgTransform(transform));
      }
    }

    // Fix transforms on all child elements
    const elements = svg.querySelectorAll('*[transform]');
    elements.forEach(el => {
      const transform = el.getAttribute('transform');
      if (transform) {
        el.setAttribute('transform', fixSvgTransform(transform));
      }
    });

    return;
  }

  // For string input, use regex to replace transform attributes
  return svg.replace(/transform="([^"]+)"/g, (match, transform) => {
    return `transform="${fixSvgTransform(transform)}"`;
  });
}