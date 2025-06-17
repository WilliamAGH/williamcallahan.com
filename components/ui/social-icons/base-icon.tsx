/**
 * Base Icon Component
 *
 * Common SVG component for social icons.
 */

import type React from "react";

// For backwards compatibility with existing icon components
export const baseIconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export interface BaseIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  viewBox?: string;
  "aria-label"?: string;
}

export function BaseIcon({
  className = "",
  viewBox = "0 0 24 24",
  children,
  ...props
}: BaseIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      {...props}
    >
      <title>Social Icon</title>
      {children}
    </svg>
  );
}
