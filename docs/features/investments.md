# Investments Architecture

## Overview

The Investments feature displays a list of private company investments. The architecture is heavily optimized for performance, pre-rendering almost all content on the server at build time. It fetches data from a static file, processes logos, and passes the fully-rendered HTML and data URLs to a lightweight client component that primarily handles the "window" UI.

## Architecture Diagram

See [Investments Architecture Diagram](./investments.mmd).

## Data & Rendering Flow

1. **Data Source**: A large, static array of `Investment` objects is defined in `data/investments.ts`.
2. **Server-Side Pre-Rendering (`Investments` server component)**:
   - Resolves all entries through `resolveInvestmentCardData` with bounded concurrency of six, preserving source order.
3. **Logo Fetching (`resolveInvestmentCardData`)**:
   - For each card, this function resolves the company's logo.
   - Manifest hits return CDN URLs immediately; fallback now calls `getLogoCdnData()` which talks to `UnifiedImageService` directly (no `/api/logo` proxy) before falling back to the placeholder SVG.
   - Resolved investment fields and logo metadata are passed to the client window; the resolver does not render cards or embed fetched logos as data URLs.
4. **Client-Side Hydration (`InvestmentsClient`)**:
   - This component receives the resolved investment data from the server.
   - Its main responsibility is to manage the interactive "window" state (minimize, maximize, close) and display the static content and prose about the investment philosophy.
   - Cards render directly as `InvestmentCardClient`; their `dark:` CSS variants handle theme styling without a per-card wrapper.

## Rendering boundary

Only the optional company-logo leaf is inside Suspense. Its repeated image markup (blur placeholder and responsive sources) must not inflate the blocking document shell. The fixed 48×48 container remains outside the boundary. Company headings, descriptions, destination links, dates, financial values and anchor IDs remain native HTML for every entry; do not wrap the whole page, list or card in Suspense. Without JavaScript, outlined logos may stay hidden, but portfolio content remains readable. Logo resolution, image optimization and cache policy are unchanged.

Verify the served native HTML includes every entry and remains below the renderer's blocking-shell budget. Also check hydrated logos, window interactions and the framework diagnostic. The isolated E2E environment has no usable logo database; its timeout before rendering cannot establish this budget. A smaller native shell does not imply fewer total response bytes or a measured paint improvement.

## Key Files & Components

- **Data Source**: `data/investments.ts`
- **Main Server Component**: `components/features/investments/investments.server.tsx`
- **Main Client Component**: `components/features/investments/investments.client.tsx`
- **Card Server Component**: `components/features/investments/investment-card.server.tsx` (Handles logo fetching)
- **Card Client Component**: `components/features/investments/investment-card.client.tsx` (Displays the final card)
- **Data Access**: `lib/data-access/investments.ts` (Parses investment data, with a regex fallback)
- **Types**: `types/investment.ts`, `types/accelerator.ts`

### UI Components (Unused)

- **`components/ui/accelerator-badge.tsx`**: A component to display accelerator program details. Currently, `investment-card.client.tsx` implements similar logic inline instead of using this component, leading to code duplication.
- **`components/ui/financial-metrics.server.tsx`**: A server component to display financial metrics. The `investment-card.client.tsx` component has an optional `renderedMetrics` prop to accept this component's output, but it is never passed, so this component is currently unused.
- **`components/ui/responsive-table.client.tsx`**: A client-side component that transforms a standard HTML table into a responsive grid of cards. It contains logic specifically tailored to display investment data, such as "Program Period" and "Investment" headers.

## Potential Improvements

- **Refactor Data Access**: The regex fallback in `lib/data-access/investments.ts` is brittle and should be removed.
- **Refactor Accelerator Display**: `investment-card.client.tsx` should be refactored to use the `accelerator-badge.tsx` component to remove duplicated code.
- **Resolve Unused Components**: The `financial-metrics.server.tsx` component and the corresponding `renderedMetrics` prop on the client card are unused. This feature should either be completed or the dead code should be removed.
- The large amount of static text in `investments.client.tsx` could potentially be moved to a server component or a markdown file to reduce the client bundle size, though the impact is likely minimal.
