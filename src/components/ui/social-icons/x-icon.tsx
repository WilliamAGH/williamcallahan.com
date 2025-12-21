/**
 * X (Twitter) Icon Component
 *
 * Custom SVG icon component that implements the LucideIcon interface.
 * Uses the SVG transform fix utilities via SvgTransformFixer.
 *
 * @see {@link lib/utils/svg-transform-fix} - For transform processing
 */

import type { LucideProps } from "lucide-react";
import { forwardRef } from "react";
import { baseIconProps } from "./base-icon";

export const X = forwardRef<SVGSVGElement, LucideProps>(function X(props, ref) {
  return (
    <svg
      ref={ref}
      {...baseIconProps}
      {...props}
      className={`${props.className || ""} x-icon`}
      viewBox="4 3 17 18"
      data-transform-fix="true"
      aria-label="X (Twitter)"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        ...props.style,
      }}
    >
      <title>X (Twitter)</title>
      {/* Paths unchanged; viewBox tightened to crop around actual content */}
      <path d="M5 4l11.733 16h3.267l-11.733 -16z" />
      <path d="M5 20l6.768 -6.768m2.46 -2.46l5.772 -6.772" />
    </svg>
  );
});

X.displayName = "X";
