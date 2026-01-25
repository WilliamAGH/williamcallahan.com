/**
 * Registry Links Component
 * @module components/ui/registry-links
 * @description
 * Displays package registry links (npm, PyPI, VS Code marketplace, etc.)
 * as styled buttons with appropriate icons and colors.
 */

"use client";

import type { RegistryType, RegistryLinksProps, RegistryConfig } from "@/types";
import { safeExternalHref } from "@/lib/utils/url-utils";
import { Package, Box, Code2, ExternalLink, Terminal } from "lucide-react";
import type { JSX } from "react";

/**
 * GitHub icon component (lucide-react doesn't export a standalone GitHub icon type well for typing)
 */
function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

const REGISTRY_CONFIG: Record<RegistryType, RegistryConfig> = {
  npm: {
    icon: Package,
    defaultLabel: "npm",
    bgLight: "bg-red-50",
    bgDark: "dark:bg-red-900/20",
    textLight: "text-red-700",
    textDark: "dark:text-red-300",
    hoverLight: "hover:bg-red-100",
    hoverDark: "dark:hover:bg-red-900/30",
  },
  maven: {
    icon: Box,
    defaultLabel: "Maven",
    bgLight: "bg-orange-50",
    bgDark: "dark:bg-orange-900/20",
    textLight: "text-orange-700",
    textDark: "dark:text-orange-300",
    hoverLight: "hover:bg-orange-100",
    hoverDark: "dark:hover:bg-orange-900/30",
  },
  vscode: {
    icon: Code2,
    defaultLabel: "VS Code",
    bgLight: "bg-blue-50",
    bgDark: "dark:bg-blue-900/20",
    textLight: "text-blue-700",
    textDark: "dark:text-blue-300",
    hoverLight: "hover:bg-blue-100",
    hoverDark: "dark:hover:bg-blue-900/30",
  },
  openvsx: {
    icon: Code2,
    defaultLabel: "Open VSX",
    bgLight: "bg-emerald-50",
    bgDark: "dark:bg-emerald-900/20",
    textLight: "text-emerald-700",
    textDark: "dark:text-emerald-300",
    hoverLight: "hover:bg-emerald-100",
    hoverDark: "dark:hover:bg-emerald-900/30",
  },
  pypi: {
    icon: Package,
    defaultLabel: "PyPI",
    bgLight: "bg-yellow-50",
    bgDark: "dark:bg-yellow-900/20",
    textLight: "text-yellow-800",
    textDark: "dark:text-yellow-300",
    hoverLight: "hover:bg-yellow-100",
    hoverDark: "dark:hover:bg-yellow-900/30",
  },
  nuget: {
    icon: Package,
    defaultLabel: "NuGet",
    bgLight: "bg-purple-50",
    bgDark: "dark:bg-purple-900/20",
    textLight: "text-purple-700",
    textDark: "dark:text-purple-300",
    hoverLight: "hover:bg-purple-100",
    hoverDark: "dark:hover:bg-purple-900/30",
  },
  crates: {
    icon: Box,
    defaultLabel: "Crates.io",
    bgLight: "bg-amber-50",
    bgDark: "dark:bg-amber-900/20",
    textLight: "text-amber-800",
    textDark: "dark:text-amber-300",
    hoverLight: "hover:bg-amber-100",
    hoverDark: "dark:hover:bg-amber-900/30",
  },
  homebrew: {
    icon: Terminal,
    defaultLabel: "Homebrew",
    bgLight: "bg-amber-50",
    bgDark: "dark:bg-amber-900/20",
    textLight: "text-amber-700",
    textDark: "dark:text-amber-300",
    hoverLight: "hover:bg-amber-100",
    hoverDark: "dark:hover:bg-amber-900/30",
  },
  github: {
    // Using Package as a placeholder since we render GitHub icon specially
    icon: Package,
    defaultLabel: "GitHub",
    bgLight: "bg-gray-100",
    bgDark: "dark:bg-gray-800",
    textLight: "text-gray-900",
    textDark: "dark:text-gray-100",
    hoverLight: "hover:bg-gray-200",
    hoverDark: "dark:hover:bg-gray-700",
  },
  other: {
    icon: ExternalLink,
    defaultLabel: "Package",
    bgLight: "bg-gray-50",
    bgDark: "dark:bg-gray-800/50",
    textLight: "text-gray-700",
    textDark: "dark:text-gray-300",
    hoverLight: "hover:bg-gray-100",
    hoverDark: "dark:hover:bg-gray-700/50",
  },
};

/**
 * Renders a list of package registry links as styled buttons.
 * Each button shows an icon appropriate to the registry type and opens in a new tab.
 *
 * @example
 * <RegistryLinks links={[
 *   { type: 'npm', url: 'https://npmjs.com/package/my-pkg' },
 *   { type: 'pypi', url: 'https://pypi.org/project/my-pkg/' }
 * ]} />
 */
export function RegistryLinks({ links, className = "" }: RegistryLinksProps): JSX.Element | null {
  if (!links || links.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {links.map((link, index) => {
        const config = REGISTRY_CONFIG[link.type];
        const label = link.label || config.defaultLabel;
        const safeUrl = safeExternalHref(link.url);

        if (!safeUrl) return null;

        const Icon = link.type === "github" ? null : config.icon;

        return (
          <a
            key={`${link.type}-${index}`}
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`
              flex items-center justify-center gap-2 w-full px-4 py-2.5
              ${config.bgLight} ${config.bgDark}
              ${config.textLight} ${config.textDark}
              ${config.hoverLight} ${config.hoverDark}
              font-medium rounded-lg transition-colors text-sm
            `}
            title={`View on ${label}`}
          >
            {link.type === "github" ? <GithubIcon className="w-4 h-4" /> : Icon ? <Icon className="w-4 h-4" /> : null}
            <span>{label}</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
          </a>
        );
      })}
    </div>
  );
}
