/**
 * Bluesky Icon Component
 *
 * Custom SVG icon component that implements the LucideIcon interface.
 * Uses the SVG transform fix utilities via SvgTransformFixer.
 * Uses outline path data for style consistency.
 *
 * @see {@link lib/utils/svg-transform-fix} - For transform processing
 */

import type { LucideProps } from "lucide-react";
import { forwardRef } from "react";
import { baseIconProps } from "./base-icon";

export const Bluesky = forwardRef<SVGSVGElement, LucideProps>(function Bluesky(props, ref) {
  // Removed internal combinedProps to avoid hydration issues
  return (
    <svg
      ref={ref}
      {...baseIconProps} // Rely on base props for styling (stroke, strokeWidth, fill, etc.)
      {...props} // Apply incoming props
      className={`${props.className || ""} bluesky-icon`}
      viewBox="0 0 24 24" // Ensure standard viewbox
      data-transform-fix="true"
      aria-label="Bluesky"
    >
      <title>Bluesky</title>
      {/* Use simplified outline path data from Tabler Icons */}
      <path
        // No fill or stroke here - controlled by SVG element
        d="M6.335 5.144c-1.654 -1.199 -4.335 -2.127 -4.335 .826c0 .59 .35 4.953 .556 5.661c.713 2.463 3.13 2.75 5.444 2.369c-4.045 .665 -4.889 3.208 -2.667 5.41c1.03 1.018 1.913 1.59 2.667 1.59c2 0 3.134 -2.769 3.5 -3.5c.333 -.667 .5 -1.167 .5 -1.5c0 .333 .167 .833 .5 1.5c.366 .731 1.5 3.5 3.5 3.5c.754 0 1.637 -.571 2.667 -1.59c2.222 -2.203 1.378 -4.746 -2.667 -5.41c2.314 .38 4.73 .094 5.444 -2.369c.206 -.708 .556 -5.072 .556 -5.661c0 -2.953 -2.68 -2.025 -4.335 -.826c-2.293 1.662 -4.76 5.048 -5.665 6.856c-.905 -1.808 -3.372 -5.194 -5.665 -6.856z"
      />
      {/* Optional: Tabler Icons often include this path for bounds, might not be needed */}
      {/* <path stroke="none" d="M0 0h24v24H0z" fill="none"/> */}
    </svg>
  );
});

Bluesky.displayName = "Bluesky";
