/**
 * LinkedIn Icon Component
 *
 * Custom SVG icon component that implements the LucideIcon interface.
 * Uses the SVG transform fix utilities via SvgTransformFixer.
 *
 * @see {@link lib/utils/svg-transform-fix} - For transform processing
 */

import type { LucideProps } from "lucide-react";
import { forwardRef } from "react";
import { baseIconProps } from "./base-icon";

export const LinkedIn = forwardRef<SVGSVGElement, LucideProps>(function LinkedIn(props, ref) {
  return (
    <svg
      ref={ref}
      {...baseIconProps}
      {...props}
      className={`${props.className || ""} linkedin-icon`}
      viewBox="0 0 24 24"
      data-transform-fix="true"
    >
      <title>LinkedIn</title>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2a2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
});

LinkedIn.displayName = "LinkedIn";
