/**
 * UI Components Index
 * @module components/ui
 * @description
 * Exports all UI components for easy importing.
 */

// Export components
export { AcceleratorBadge } from "./accelerator-badge";
export { CodeBlock } from "./code-block/code-block.client";
export { CopyButton } from "./code-block/copy-button.client";
export { ExternalLink } from "./external-link.client";
export { default as FinancialMetrics } from "./financial-metrics.server";
export { FocusTrap } from "./focusTrap.client";
export { LogoImage } from "./logo-image.client";
export { ResponsiveTable as MDXTable } from "./responsive-table.client";
export { ThemeToggle } from "./theme/theme-toggle";

// Re-export nested components
export * from "./navigation";
export * from "./social-icons";
export * from "./terminal";
