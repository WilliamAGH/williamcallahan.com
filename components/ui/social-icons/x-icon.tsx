/**
 * X Icon Component
 */

import { LucideIcon } from "lucide-react";
import { baseIconProps } from './base-icon';

export const X: LucideIcon = function X(props) {
  return (
    <svg {...baseIconProps} {...props}>
      <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
      <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
    </svg>
  );
}