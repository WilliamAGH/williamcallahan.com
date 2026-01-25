/**
 * Registry Link Schemas
 * @module types/schemas/registry-link
 * @description
 * Zod schemas for package registry links (npm, maven, VS Code marketplace, etc.).
 * Enables projects and bookmarks to link to their package distributions.
 */

import type { ComponentType } from "react";
import { z } from "zod/v4";

/**
 * Supported package registry types.
 * Each type corresponds to a well-known package distribution platform.
 */
export const registryTypeSchema = z.enum([
  "npm", // npmjs.com
  "maven", // mvnrepository.com, search.maven.org, central.sonatype.com
  "vscode", // marketplace.visualstudio.com
  "openvsx", // open-vsx.org (Eclipse/OSS marketplace)
  "pypi", // pypi.org
  "nuget", // nuget.org
  "crates", // crates.io (Rust)
  "homebrew", // formulae.brew.sh
  "github", // github.com (for repos not covered by dedicated githubUrl)
  "other", // Custom registry with required label
]);

/**
 * A link to a package registry or distribution platform.
 */
export const registryLinkSchema = z
  .object({
    /** The type of registry (determines icon and default label) */
    type: registryTypeSchema,
    /** Full URL to the package on the registry */
    url: z.string().url(),
    /** Optional custom label (required for 'other' type, overrides default for known types) */
    label: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "other" && !value.label?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "label is required when type is 'other'",
        path: ["label"],
      });
    }
  });

/**
 * Type exports using z.infer for single source of truth
 */
export type RegistryType = z.infer<typeof registryTypeSchema>;
export type RegistryLink = z.infer<typeof registryLinkSchema>;

/**
 * Validation functions for external data
 */
export const validateRegistryLink = (data: unknown): RegistryLink => {
  return registryLinkSchema.parse(data);
};

export const validateRegistryLinks = (data: unknown): RegistryLink[] => {
  return z.array(registryLinkSchema).parse(data);
};

/**
 * Configuration for rendering a specific registry type.
 * Used by the RegistryLinks UI component for icon and styling.
 */
export type RegistryConfig = {
  /** Lucide icon component to use (technically LucideIcon type, kept generic for flexibility) */
  icon: ComponentType<{ className?: string }>;
  /** Default display label (e.g., "npm", "PyPI") */
  defaultLabel: string;
  /** Tailwind classes for light mode background */
  bgLight: string;
  /** Tailwind classes for dark mode background */
  bgDark: string;
  /** Tailwind classes for light mode text */
  textLight: string;
  /** Tailwind classes for dark mode text */
  textDark: string;
  /** Tailwind classes for light mode hover */
  hoverLight: string;
  /** Tailwind classes for dark mode hover */
  hoverDark: string;
};
