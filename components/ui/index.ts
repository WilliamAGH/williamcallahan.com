/**
 * UI Components Index
 * @module components/ui
 * @description
 * Exports all UI components for easy importing.
 */

// Export components
export { AcceleratorBadge } from './accelerator-badge';
export { CodeBlock } from './code-block/code-block.client';
export { CopyButton } from './code-block/copy-button.client';
export { ExternalLink } from './external-link.client';
export { default as FinancialMetrics } from './financial-metrics.server';
export { LogoImage } from './logo-image.client';
export { MDXTable } from '../features/blog/shared/mdx-table.server';

// Re-export nested components
export * from './navigation';
export * from './social-icons/social-icons.client';
export * from './terminal';
export * from './theme';
