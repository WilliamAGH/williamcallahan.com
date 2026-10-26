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
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
      className={`${props.className || ""} x-icon`}
      viewBox="0 0 24 24"
      data-transform-fix="true"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        ...props.style,
      }}
    >
      {/* Optical sizing: scale down slightly to match visual weight of other icons */}
      <g transform="translate(0.25 0.25) scale(0.98)">
        <path d="M5 4l11.733 16h3.267l-11.733 -16z" />
        <path d="M5 20l6.768 -6.768m2.46 -2.46l5.772 -6.772" />
      </g>
    </svg>
  );
});

X.displayName = "X";
