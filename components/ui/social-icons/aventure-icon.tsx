/**
 * aVenture Icon Component
 */

import React from "react";
import { BaseIcon } from "./base-icon";
import type { BaseIconProps } from "@/types/ui/social";

/**
 * aVenture icon component
 */
export function AVentureIcon({ className, ...props }: BaseIconProps) {
  return (
    <BaseIcon className={className} viewBox="0 0 48 48" stroke="none" {...props}>
      <path
        d="M24 0C10.745 0 0 10.745 0 24C0 37.255 10.745 48 24 48C37.255 48 48 37.255 48 24C48 10.745 37.255 0 24 0ZM34.5 36H24.9375L17.25 18H12V12H22.0625L29.75 30H35V36H34.5Z"
        fill="currentColor"
      />
    </BaseIcon>
  );
}
