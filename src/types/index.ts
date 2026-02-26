/**
 * 🗺️ TYPE DEFINITIONS INDEX & LOCATION GUIDE
 *
 * Central export point and definitive map for ALL type definitions.
 * Organization: Domain-specific files, UI props, utilities, and architectural patterns.
 * 🎯 Quick Search: Use Cmd/Ctrl+F to find any type name below
 */

// =============================================================================
// 🏗️ CORE DOMAIN TYPES - Business Logic & Data Models
// =============================================================================

/** 📦 BOOKMARK DOMAIN (types/bookmark.ts) - Core entities, validation, API types */
export * from "./bookmark";

/** 📦 REGISTRY LINK DOMAIN (types/schemas/registry-link.ts) - Package registry links for projects/bookmarks */
export type { RegistryType, RegistryLink, RegistryConfig } from "./schemas/registry-link";
export {
  registryTypeSchema,
  registryLinkSchema,
  validateRegistryLink,
  validateRegistryLinks,
} from "./schemas/registry-link";

/** 🐙 GITHUB DOMAIN (types/github.ts) - Activity data, repository stats, API responses */
export * from "./github";

/** 🖼️ LOGO DOMAIN (types/logo.ts) - Logo data, processing, analysis types */
export * from "./logo";

/** 💼 INVESTMENT DOMAIN (types/investment.ts) - Investment entities, portfolio, financial metrics */
export * from "./investment";

/** 📝 BLOG DOMAIN (types/blog.ts) - Blog posts, articles, content management */
export * from "./blog";

/** 🖼️ OPENGRAPH DOMAIN (types/opengraph.ts) - OpenGraph data, errors, and cache entries */
export type {
  OgResult,
  KarakeepImageFallback,
  OgCacheEntry,
  OgMetadata,
  PersistImageResult,
} from "./opengraph";
export { OgError, isOgResult } from "./opengraph";

/** 🖼️ IMAGE DOMAIN (types/image.ts) - Image processing and service types */
export type { ImageServiceOptions, ImageResult } from "./image";

/** 🔗 SEO DOMAIN (types/seo/*) - SEO metadata, Open Graph, structured data */
export * from "./seo";

/** 👤 EXPERIENCE DOMAIN (types/experience.ts) - Professional experience, work history */
export * from "./experience";

/** 🎓 EDUCATION DOMAIN (types/education.ts) - Educational background, certifications */
export * from "./education";

/** 🧭 NAVIGATION DOMAIN (types/navigation.ts) - Site navigation, menus, routing */
export * from "./navigation";

/** 📱 SOCIAL DOMAIN (types/social.ts) - Social media integration and sharing */
export * from "./social";

/** 🔗 RELATED CONTENT DOMAIN (types/related-content.ts) - Related content recommendations */
export * from "./related-content";

/** 💻 TERMINAL DOMAIN (types/terminal.ts) - Core terminal logic, commands, business data (NOT component props) */
export * from "./terminal";

// =============================================================================
// 🎨 UI & COMPONENT TYPES - Interface & Component Props
// =============================================================================

/** 🖼️ UI COMPONENT PROPS (types/ui/*) - Component props ONLY (business logic goes in domain files) */
export * from "./ui";

/** 🏗️ COMPONENT ARCHITECTURE (types/component-types.ts) - Architectural patterns and classification */
export * from "./component-types";

/** 🎯 FEATURE COMPONENT PROPS (types/features/*) - Domain-specific component props by feature area */
export * from "./features/blog";
export * from "./features/bookmarks";
export * from "./features/experience";
export * from "./features/github";
export * from "./features/home";
export type {
  InvestmentCardProps,
  InvestmentsProps,
  InvestmentsClientProps,
  InvestmentsServerProps,
  InvestmentCardExtendedProps,
} from "./features/investments";
export * from "./features/projects";
export * from "./features/seo";
export * from "./features/social";
export * from "./features/software";

// =============================================================================
// ⚙️ INFRASTRUCTURE & UTILITY TYPES - Technical & System Types
// =============================================================================

/** 🔧 LIBRARY & UTILITIES (types/lib.ts) - Generic utilities, infrastructure, cross-cutting concerns */
export * from "./lib";

/** 💾 CACHE TYPES (types/cache.ts) - Specialized caching types for different data domains */
export type {
  ImageCacheEntry,
  LogoValidationResult,
  LogoFetchResult,
  InvertedLogoEntry,
  GitHubActivityCacheEntry,
  BookmarksCacheEntry,
  SearchCacheEntry,
  // OgCacheEntry is exported from ./seo, so we avoid a conflict here.
} from "./cache";

/** ⛑️ HEALTH & MONITORING (types/health.ts) - System health, memory usage, monitoring types */
export * from "./health";

// =============================================================================
// 🌐 API & EXTERNAL TYPES - Data Exchange & Integration
// =============================================================================

/** 🔌 API INTERFACES (types/api.ts) - API request/response types and external service integration */
export * from "./api";

/** 🚨 ERROR HANDLING (types/error.ts) - Error types, boundaries, and reporting */
export * from "./error";

// =============================================================================
// 🧪 TESTING & DEVELOPMENT TYPES - Development Support
// =============================================================================

/** 🧪 TEST TYPES (types/test.ts) - Testing utilities, mock types, test configuration */
export * from "./test";

/** 🔧 DEBUG TYPES (types/debug.ts) - Development and debugging utilities */
export * from "./debug";

/** グローバル (global/*) - Window, globals, test matchers */
// export * from "./global";

// =============================================================================
// 🎯 QUICK REFERENCE MAP - Type Boundaries & Locations
// =============================================================================

/**
 * DOMAIN BOUNDARIES & FILE LOCATIONS:
 *
 * Business Logic & Data Models (NO component props):
 * • Bookmark entities, validation, API types      → types/bookmark.ts
 * • GitHub activity, repository stats             → types/github.ts
 * • Logo processing, validation, analysis         → types/logo.ts
 * • Investment entities, portfolio, financials    → types/investment.ts
 * • Blog posts, articles, content management      → types/blog.ts
 * • OpenGraph data, errors, cache                 → types/opengraph.ts
 * • SEO metadata, Open Graph, structured data     → types/seo/*
 * • Professional experience, work history         → types/experience.ts
 * • Educational background, certifications        → types/education.ts
 * • Site navigation, menus, routing               → types/navigation.ts
 * • Social media integration, sharing             → types/social.ts
 * • Terminal commands, logic, business data       → types/terminal.ts
 *
 * UI & Component Types (NO business logic):
 * • Component props for UI elements               → types/ui/*
 * • Architectural patterns, classification        → types/component-types.ts
 * • Feature-specific component props              → types/features/*
 *
 * Infrastructure & System Types:
 * • Generic utilities, cross-cutting concerns     → types/lib.ts
 * • Specialized caching for data domains          → types/cache.ts
 * • API request/response, external integration    → types/api.ts
 * • Error handling, boundaries, reporting         → types/error.ts
 * • Testing utilities, mocks, configuration       → types/test.ts
 * • Development, debugging utilities              → types/debug.ts
 *
 * 🚨 MAINTENANCE RULE: When adding new feature files to types/features/,
 * ALWAYS update the export list in this index.ts file to include the new feature.
 * Example: Adding types/features/new-feature.ts requires adding:
 * export * from "./features/new-feature";
 *
 * === TYPE SAFETY RULES DISCOVERED ===
 * 🔒 TYPE NAMING CONFLICTS:
 *   - Never create duplicate type names (e.g., avoid DataFetchResult<T> AND DataFetchResult = Alias)
 *   - Use unique, descriptive names for each interface/type
 *   - When aliasing, use clear suffix: DataFetchOperationSummary vs DataFetchResult<T>
 *
 * 🔍 IMPORT USAGE:
 *   - Remove unused imports immediately to prevent lint warnings
 *   - Use eslint-disable comments sparingly for legitimate cases (e.g., future-reserved functions)
 *   - Import only what's needed, avoid wildcard imports in type definitions
 *
 * 📝 SERVER TYPES:
 *   - Configuration types belong in types/lib.ts (e.g., MonitoredAsyncOperation)
 *   - API operation result types should be consistently named and exported
 *   - Use explicit type annotations when TypeScript inference fails with union types
 *
 * 🚨 CRITICAL: CIRCULAR DEPENDENCY PREVENTION:
 *   - Types should NEVER import from lib/, components/, or higher-level directories
 *   - Constants should be defined in lib/ files, not in types/ files (except when breaking cycles)
 *   - If types need constants, move constants to types layer to break the cycle
 *   - Circular dependencies cause TypeScript to infer 'any', triggering unsafe operation warnings
 *   - Pattern: types/domain.ts imports from lib/constants.ts → lib/logic.ts imports from types/domain.ts
 *   - Solution: Move constants to types layer or create separate shared constants file
 *   - Examples resolved: SEO_DATE_FIELDS, SOCIAL_PLATFORMS moved to break cycles
 *
 * ⚡ LINT WARNING PATTERNS:
 *   - "Unsafe assignment/member access on error typed value" usually indicates circular dependencies
 *   - Function parameters appearing as 'any' type suggests import cycle resolution failure
 *   - Fix: Identify and break circular import chains rather than adding explicit type annotations
 *
 * 🔧 TROUBLESHOOTING WORKFLOW (for future type safety issues):
 *   1. Run `bun run lint | grep "Warning" | cut -d':' -f1 | sort | uniq -c | sort -rn` to find highest-impact files
 *   2. For "unsafe operation" warnings: Check if function parameters show as 'any' type in IDE
 *   3. Trace imports: If 'any' types, look for circular import chain (types → lib → types)
 *   4. Break cycle: Move shared constants to types layer or create dedicated constants file
 *   5. Verify fix: Re-run linter to confirm warnings eliminated (often 40-70 warnings per cycle broken)
 *   6. Document: Add discovered patterns to this section for future reference
 *
 * 🎯 SYSTEMATIC TYPE SAFETY SUCCESS METRICS (PROVEN APPROACH):
 *   - BASELINE: 267 TypeScript warnings across all components
 *   - ARCHITECTURAL FIXES: Reduced to 21 warnings (92% improvement)
 *   - APPROACH: Root cause resolution over symptom treatment
 *   - KEY INSIGHT: Circular dependencies cause "error typed value" warnings
 *   - MAJOR FIXES: SerializableBookmark conversion, AsyncOperation types, social/terminal cycles
 *   - REMAINING: 21 legitimate type safety improvements (dynamic access, unused vars, etc.)
 *   - IMPACT: Transformed from systemic type issues to maintainable, type-safe codebase
 *
 * 🛡️ ZOD SCHEMA & TYPE INFERENCE BEST PRACTICES:
 *   - GOAL: Maintain a single source of truth for data structures to prevent drift between validation and static types.
 *   - OFFICIAL DOCS: https://zod.dev/
 *
 *   - 1. DEFINE a Zod schema in the appropriate `lib/validators/*.ts` or `lib/schemas/*.ts` file.
 *     - This schema is the canonical definition of your data structure.
 *     - Example: `lib/schemas/bookmarks.ts` contains `clientBookmarkSchema`.
 *
 *   - 2. INFER TypeScript types directly from the Zod schema using `z.infer<typeof ...>`.
 *     - This ensures your static types always match your runtime validation rules.
 *     - DO NOT manually define a separate interface; infer it instead.
 *
 *   - 3. STORE inferred types in the corresponding `types/*.ts` or `types/features/*.ts` file.
 *     - This co-locates the type with other related domain or feature types.
 *     - Example: `export type BlogPost = z.infer<typeof BlogPostSchema>;` goes in `types/blog.ts`.
 *
 *   - 4. LINTING RULE: A custom `no-restricted-syntax` rule enforces that type aliases (`type T = ...`)
 *     are only defined in the `@/types` directory or in `.d.ts` files. This prevents types from being
 *     defined alongside Zod schemas in `lib/` and ensures separation of concerns.
 *
 *   - 5. STRATEGIC VALIDATION PATTERN: Use Zod validation at data boundaries to eliminate "error" type inference:
 *     - Before caching external API responses
 *     - Before transforming data for client components (server-to-client boundaries)
 *     - When accessing uncertain external data (OpenGraph metadata, social API responses)
 *     - Pattern: Parse → Validate → Use (rather than directly accessing unknown properties)
 *
 *   - WORKFLOW EXAMPLE:
 *     a. Create `export const UserSchema = z.object({ ... });` in `lib/validators/user.ts`.
 *     b. Create `export type User = z.infer<typeof UserSchema>;` in `types/user.ts`.
 *     c. In application code, import `User` from `@/types/user` for static typing and `UserSchema`
 *        from `@/lib/validators/user` for runtime parsing.
 *
 * 🎯 DISCRIMINATED UNIONS FOR COMPLEX STATE MANAGEMENT:
 *   - USE discriminated unions for type safety with complex state that has multiple variants
 *   - PATTERN: Base interface + type-specific extensions with mandatory `type` discriminator field
 *   - EXAMPLE: Terminal commands with different shapes (text, selection, navigation, error, etc.)
 *   - BENEFIT: TypeScript can narrow types automatically based on the discriminator, eliminating unsafe operations
 *   - IMPLEMENTATION: Create type guards for runtime type checking alongside the union types
 *   - Example from `types/terminal.ts`:
 *     ```typescript
 *     export type TerminalCommand = TextOutputCommand | SelectionCommand | NavigationCommand | ErrorCommand;
 *     export function isSelectionCommand(command: TerminalCommand): command is SelectionCommand {
 *       return command.type === 'selection';
 *     }
 *     ```
 */
