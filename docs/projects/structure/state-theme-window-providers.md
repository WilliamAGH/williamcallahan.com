# State, Theme & Window Providers Architecture

**Functionality:** `state-theme-window-providers`

## Core Objective

Centralized provider composition for application-wide state management, including theme preferences, terminal state, and window management.

## Key Files

- **`app/providers.client.tsx`**: Root provider composition
  - Wraps app in ThemeProvider and TerminalProvider
  - Client-side only with `"use client"` directive
  
- **`app/layout.tsx`**: Additional provider integration
  - Adds GlobalWindowRegistryProvider
  - Wraps providers with error boundaries

## Provider Hierarchy

```tsx
// In providers.client.tsx
<ThemeProvider
  disableTransitionOnChange    // Prevents flash during theme switch
  enableSystem                  // Respects OS theme preference
  attribute="class"             // Uses class-based theming
  defaultTheme="system"
>
  <TerminalProvider>
    <Suspense fallback={null}>
      {children}
    </Suspense>
  </TerminalProvider>
</ThemeProvider>

// Added in layout.tsx
<Providers>
  <GlobalWindowRegistryProvider>
    {app content}
  </GlobalWindowRegistryProvider>
</Providers>
```

## State Management Systems

### 1. Theme State

- **Provider**: `ThemeProvider` from next-themes
- **Storage**: localStorage with 24-hour expiry
- **Features**:
  - System theme detection
  - Manual light/dark toggle
  - Automatic expiry to system preference
  - Dark Reader compatibility

#### Overview

The "theming" functionality group is responsible for managing the application's visual theme (light and dark modes). It provides the necessary components and logic to toggle themes, persist user preferences, and ensure the theme is applied consistently across the application.

#### Key Files and Responsibilities

- **`components/ui/theme/theme-provider.client.tsx`**: A client-side component that wraps the entire application using `next-themes`. It handles theme state management, persistence to `localStorage`, and system theme detection. It also includes logic to expire explicit theme overrides after 24 hours, reverting to the system preference.
- **`components/ui/theme/theme-toggle.tsx`**: A client-side button component that allows the user to manually switch between light and dark themes. It provides visual feedback and correctly updates the theme state via the `ThemeProvider`.

#### Logic Flow and Interactions

- The `ThemeProvider` is the core of this functionality, providing the `useTheme` hook that other components, like `ThemeToggle`, use to access and modify the current theme.
- `ThemeToggle` uses the `setTheme` function from `useTheme` to switch between 'light' and 'dark' modes and stores a timestamp in `localStorage` to track the user's explicit choice.
- `ThemeProvider` contains a `ThemeExpiryHandler` that checks this timestamp on mount. If the user's choice is older than 24 hours, it reverts the theme to 'system', otherwise, it respects the user's choice.
- The provider applies the theme by adding a `class="dark"` to the `<html>` element, which is then used by Tailwind CSS for dark mode styling.

### 2. Terminal State (→ terminal.md)

- **Provider**: `TerminalProvider`
- **Storage**: sessionStorage for history
- **Features**:
  - Terminal visibility toggle
  - Command history persistence
  - Selection state management

### 3. Window State Management

- **Provider**: `GlobalWindowRegistryProvider`
- **Storage**: sessionStorage per window ID
- **Features**:
  - Window states: normal, minimized, maximized, closed
  - Multi-window coordination
  - Hydration-safe state management

#### Window Management Hooks

See [`hooks.md`](./hooks.md#window-management) for detailed documentation of window-related hooks.

- **`lib/hooks/use-window-size.client.ts`**: Reactive window dimension tracking
- **`lib/hooks/use-window-state.client.ts`**: Window state management with persistence
  
#### Window Registry Context

- **`lib/context/global-window-registry-context.client.tsx`**: Global window registry
  - Centralized state management for multiple windows
  - Tracks states by unique window IDs
  - Provides useWindowRegistry and useRegisteredWindowState hooks
  - Handles automatic registration/unregistration

#### Window State Logic Flow

1. **Window Size Tracking**:
   - Initialize with undefined (SSR safety)
   - Set up resize event listener on mount
   - Update dimensions on resize
   - Clean up on unmount

2. **Window State Management**:
   - Initialize from sessionStorage or default
   - Use hydration-safe mounting pattern
   - Persist state changes to storage
   - Provide state manipulation methods

3. **Global Registry**:
   - Register windows on mount
   - Track states in centralized store
   - Coordinate multi-window actions
   - Clean up on unmount

#### Type Definitions

- **`types/global/window.d.ts`**: TypeScript augmentations for Window interface
  - Extends global Window object with custom properties
  - Ensures type safety for window-related operations

## Implementation Details

- All providers are memoized to prevent re-renders
- Hydration safety through SSR/client synchronization
- Dark Reader compatibility handled via `SvgTransformFixer` in layout
- **Server Transition Detection** logic handled by `AnchorScrollManager` component
- Error boundaries isolate provider failures

## Related Documentation

- **Hooks Infrastructure**: See [`hooks.md`](./hooks.md) for all React hooks including window management, SSR compatibility, and other utilities
- **App Layout Integration**: See [`app-layout.md`](./app-layout.md) for how providers are integrated in the root layout
- **Terminal System**: See [`terminal.md`](./terminal.md) for terminal-specific state management

## Architecture Diagram

See [`state-theme-window-providers.mmd`](./state-theme-window-providers.mmd) for a visual representation of the provider hierarchy and state management flow.
