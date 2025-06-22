/**
 * Investment Feature Component Props
 *
 * SCOPE: Investment-specific component props and interfaces
 * USAGE: Use for investment cards, portfolios, performance displays, and related UI components
 * OVERLAP PREVENTION: Do NOT add generic UI props (use types/ui.ts)
 * DO NOT add other feature domains (use separate feature files)
 *
 * DRY PRINCIPLE: When creating component props, prefer extending/reusing types from
 * the core domain model (types/investment.ts) rather than recreating similar structures.
 * Example: Use `investment: Investment` instead of redefining investment properties inline.
 *
 * @see types/investment.ts for investment domain models and data types
 * @see types/ui.ts for generic UI component props
 */

import type { JSX } from "react";
import type { Investment } from "../investment";

/**
 * Investment card component props
 * @usage - Individual investment display cards
 */
export interface InvestmentCardProps {
  /** Investment data */
  investment: Investment;
  /** Whether to show performance details */
  showPerformance?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Interactive investment card component props
 * @usage - Client-side investment cards with click handlers
 */
export interface InvestmentCardClientProps extends InvestmentCardProps {
  /** Whether card is interactive */
  interactive?: boolean;
  /** Click callback */
  onClick?: (investment: Investment) => void;
}

/**
 * Investment list component props
 * @usage - Collections of investment data
 */
export interface InvestmentsProps {
  /** Array of investments */
  investments: Investment[];
  /** Sort order */
  sortBy?: "name" | "value" | "performance" | "date";
  /** Optional CSS classes */
  className?: string;
}

/**
 * Client-side investments component props
 * @usage - Interactive investment lists with filtering/sorting
 */
export interface InvestmentsClientProps {
  /** List of pre-rendered investment cards */
  investments: InvestmentWithCard[];
}

/**
 * Server-side investments component props
 * @usage - Server-rendered investment lists with caching
 */
export interface InvestmentsServerProps extends InvestmentsProps {
  /** Server-side configuration */
  serverConfig?: {
    cacheKey?: string;
    ttl?: number;
  };
}

/**
 * Extended investment card props with logo data
 * @usage - Investment cards with pre-fetched logo data
 */
export interface InvestmentCardExtendedProps extends Investment {
  /** Pre-fetched logo data from server */
  logoData: import("../logo").LogoData;
  /** Whether dark theme is active */
  isDarkTheme?: boolean;
  /** Rendered financial metrics */
  renderedMetrics?: JSX.Element;
}

/**
 * Extended investment type with pre-rendered card
 * @interface
 * @extends {Investment}
 */
export interface InvestmentWithCard extends Investment {
  /** Pre-rendered JSX element for the investment card */
  card: JSX.Element;
}
