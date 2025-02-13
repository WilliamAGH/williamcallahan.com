// components/ui/index.ts

/**
 * UI Components Index
 * @module components/ui
 * @description
 * Exports all UI components for easy importing.
 */

// Export components
export { AcceleratorBadge } from './acceleratorBadge';
export { CodeBlock } from './codeBlock';
export { CopyButton } from './copyButton';
export { ExternalLink } from './externalLink';
export { default as FinancialMetrics } from './financialMetrics';
export { FocusTrap } from './focusTrap';
export { LogoImage } from './logoImage';
export { MDXTable } from './mdxTable';
export { ThemeToggle } from './themeToggle';

// Re-export nested components
export * from './navigation';
export * from './social-icons';
export * from './terminal';
