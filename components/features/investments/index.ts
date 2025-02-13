/**
 * Investments Feature Components - Public API
 * @module components/features/investments
 * @description
 * Public API barrel file for the investments feature.
 * This file exports components for use by other features.
 *
 * IMPORTANT: This is a barrel file for external consumption only.
 * Components within the investments feature should NOT import from this file.
 * Instead, they should import directly from component files to avoid
 * circular dependencies.
 *
 * @example
 * // ❌ Don't do this inside investments feature
 * import { InvestmentCardServer } from './index';
 *
 * // ✅ Do this instead
 * import { InvestmentCard as InvestmentCardServer } from './investment-card.server';
 *
 * @see {@link "docs/development/best-practices.md"} - Dependency management guidelines
 * @see {@link "app/investments/page.tsx"} - Investments page implementation
 * @see {@link "data/investments.ts"} - Investment data source
 * @see {@link "types/investment.ts"} - Investment type definitions
 */

/**
 * Main Investments component - Server-side rendered
 * Implements async server component pattern:
 * - Pre-renders investment cards on the server
 * - Uses force-dynamic rendering for real-time data
 * - Handles server-side data fetching and processing
 *
 * Note: Internal components should import directly from investments.server.tsx
 *
 * @see {@link "components/features/investments/investments.server.tsx"} - Server component implementation
 */
export { Investments } from './investments.server';

/**
 * Investment Card component - Server-side rendered
 * Handles individual investment card rendering:
 * - Pre-processes logos and metadata on the server
 * - Optimizes image loading and caching
 *
 * Note: Internal components should import directly from investment-card.server.tsx
 *
 * @see {@link "components/features/investments/investment-card.server.tsx"} - Card component implementation
 */
export { InvestmentCard as InvestmentCardServer } from './investment-card.server';
