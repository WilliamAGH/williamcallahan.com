/**
 * Base Icon Component
 * 
 * Provides consistent base props for all custom icons
 */

import { SVGProps } from 'react';

export const baseIconProps = {
  xmlns: "http://www.w3.org/2000/svg",
  width: "24",
  height: "24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
} as const;