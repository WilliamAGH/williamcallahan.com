# Core Hooks Architecture Map

## Overview

The hooks infrastructure provides essential React utilities for UI interactions, state management, and browser API integration. All hooks follow consistent patterns for SSR safety, performance optimization, and proper cleanup.

## Key Files and Responsibilities

### Navigation & Scrolling

- **`lib/hooks/use-anchor-scroll.client.ts`** (159 lines): Handles smooth scrolling to anchor links with retry logic
  - Opens CollapseDropdown components if target is inside
  - Browser-specific optimizations (Firefox gets longer delays)
  - Exponential backoff retry mechanism (max 8 retries)
  - Monitors both initial hash and hash changes

### SVG Processing

- **`lib/hooks/use-fix-svg-transforms.ts`** (90 lines): Fixes SVG transform attributes in containers
  - Returns ref to attach to container elements
  - Uses MutationObserver for dynamic SVG additions
  - Generic type support for different HTML elements
  - Integrates with `processSvgTransforms` utility

### SSR Compatibility

- **`lib/hooks/use-isomorphic-layout-effect.ts`** (37 lines): SSR-safe useLayoutEffect
  - Prevents React warnings during server rendering
  - Uses useLayoutEffect on client for synchronous DOM updates
  - Falls back to useEffect on server
  - Drop-in replacement for useLayoutEffect

### Data Fetching

- **`lib/hooks/use-logo.ts`** (48 lines): Asynchronous logo URL fetching
  - Manages loading and error states
  - Prevents state updates on unmounted components
  - Integrates with `fetchLogo` from lib/logo
  - Handles undefined input gracefully

### Window Management

- **`lib/hooks/use-window-size.client.ts`** (42 lines): Reactive window dimension tracking
  - Returns current width and height
  - Updates on window resize events
  - SSR-safe with undefined initial state
  - No debouncing for immediate updates

- **`lib/hooks/use-window-state.client.ts`** (124 lines): Window state management with persistence
  - Four states: normal, minimized, maximized, closed
  - SessionStorage persistence per component ID
  - Hydration-safe with `isReady` flag
  - Memoized methods: closeWindow, minimizeWindow, maximizeWindow

## Common Patterns

### SSR Safety

- Undefined initial states matching server/client
- `typeof window` checks for browser APIs
- Hydration flags (`isReady`) for state synchronization
- Client-only file naming convention (`.client.ts`)

### Performance Optimization

- `useCallback` for stable function references
- `useMemo` for expensive computations
- Careful dependency arrays to prevent loops
- Cleanup functions for all side effects

### Error Handling

- Try-catch blocks for storage operations
- Graceful degradation when APIs unavailable
- Error state management in data fetching
- Null checks and optional chaining

### TypeScript Integration

- Strong typing with interfaces and type exports
- Generic type support where applicable
- JSDoc comments for documentation
- Type-safe return values

## Integration with Providers

These hooks integrate with the application's provider hierarchy:

- **Window hooks** → `GlobalWindowRegistryProvider`
- **Theme utilities** → `ThemeProvider`
- **Terminal features** → `TerminalProvider`

See [`state-theme-window-providers.md`](./state-theme-window-providers.md) for provider details.

## Usage Examples

### App Layout Integration

- **Anchor Scrolling**: Used in [`app-layout.md`](./app-layout.md) for smooth navigation to page sections
- **SVG Transform Fixes**: Applied to containers throughout the layout to fix browser rendering issues
- **Interactive Containers**: The `use-anchor-scroll` hook specifically integrates with [`interactive-containers.md`](./interactive-containers.md) components like CollapseDropdown

## Architecture Diagram

See [`hooks.mmd`](./hooks.mmd) for a visual representation of the hooks ecosystem and their interactions.
