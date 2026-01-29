/**
 * Social Icon Component
 *
 * Renders a social media icon with link and hover effects.
 */

import { cn } from "@/lib/utils";
import type { SocialIconProps } from "@/types/ui/social";

export function SocialIcon({ href, label, icon: Icon, emphasized }: SocialIconProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "px-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors relative group",
        emphasized && "text-gray-800 dark:text-gray-200",
      )}
      aria-label={label}
      title={label}
    >
      <Icon
        className={cn(
          "w-[18px] h-[18px] sm:w-5 sm:h-5 transition-all duration-200",
          emphasized && "scale-105 group-hover:scale-110",
          emphasized &&
            "group-hover:drop-shadow-[0_0_6px_rgba(59,130,246,0.5)] dark:group-hover:drop-shadow-[0_0_6px_rgba(96,165,250,0.6)]",
        )}
      />
      {emphasized && (
        <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-blue-400/10 dark:bg-blue-500/10 blur-md -z-10" />
      )}
    </a>
  );
}
