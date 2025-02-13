# State Management Architecture

WE ARE NOT ALLOWED TO ADD ANY NEW FEATURES OR FUNCTIONALITY. FIXING THE CURRENT CODE BASE IS THE MANDATE.

## Overview
The application uses a hybrid approach to state management, leveraging Next.js 14's Server Components by default and isolating client state to specific interactive components. The system is designed to minimize client-side JavaScript while maintaining rich interactivity where needed.

Make sure all solutions proposed and implemented are fully compliant with Next.
js 14 App Router documentation requirements (https://nextjs.org/docs)

## Core Principles
1. Server-First Architecture
   - Use Server Components by default
   - Keep state on server where possible
   - Minimize client-side JavaScript

2. Client Boundaries
   - Clearly marked with "use client"
   - Isolated to specific interactive features
   - Proper hydration handling

3. State Categories
   - Server State: Data fetching, static content
   - Client State: Theme, navigation, terminal
   - Shared State: Hydration-safe interactions

## Core Files

### Direct Dependencies
1. Provider Components (`"use client"`)
   - `app/providers.tsx` - Root providers wrapper
   - `app/client-components/providers/theme-provider.tsx` - Theme state provider
   - `app/client-components/providers/terminal-provider.tsx` - Terminal state provider
   - `components/providers/theme-provider.tsx` - Theme context provider

2. State Initialization
   - `app/client-components/theme/theme-initializer.tsx`
   - `app/layout.tsx` - Server Component root

3. State Hooks (`"use client"`)
   - `lib/hooks/useTouchHandler.ts`
   - `lib/hooks/useLogo.ts`
   - `components/ui/terminal/useTerminal.ts`

### Component State
1. Server Components
   - Blog content rendering
   - Static navigation structure
   - Initial theme detection

3. State Hooks
   - `lib/hooks/useTouchHandler.ts` - Touch state management
   - `lib/hooks/useLogo.ts` - Logo state management
   - `components/ui/terminal/useTerminal.ts` - Terminal state management

2. Client Components (`"use client"`)
   - Navigation interactions
   - Theme switching
   - Terminal interface

### Indirect Dependencies
1. Component State
   - `components/ui/navigation/navigation.tsx` - Navigation state
     * Menu open/close state
     * Transition state
     * Render state
     * Touch event state
   - `components/ui/theme-toggle.tsx` - Theme toggle state
   - `components/ui/terminal/terminal.tsx` - Terminal state
     * Input state
     * History state
     * Selection state
   - `components/ui/focus-trap.tsx` - Focus management state
     * Focus tracking
     * Event handling
     * Cleanup state

2. Data Management
   - `lib/cache.ts` - Cache state management
   - `lib/server-cache.ts` - Server-side cache
   - `lib/blog/core.ts` - Blog state management

### Test Files
- `__tests__/lib/setup/theme.ts`
- `__tests__/lib/cache.test.ts`
- `__tests__/lib/server-cache.test.ts`
- `__tests__/components/ui/theme-toggle.test.tsx`
- `__tests__/components/ui/navigation/navigation.test.tsx`
- `__tests__/components/ui/terminal/terminal.test.tsx`

## Current Issues

### Navigation State Management
1. Race Conditions
   - Menu state transitions during animations
   - Touch event handling during transitions
   - Focus management during menu changes
   - Required fix: Proper state synchronization and cleanup

2. Memory Leaks
   - Event listener cleanup in navigation
   - Touch handler event cleanup
   - Animation frame cleanup
   - Required fix: Consistent cleanup on unmount

3. Performance Issues
   - Unnecessary rerenders in navigation
   - Touch event debounce performance
   - Animation frame management
   - Required fix: Proper memoization and cleanup

### Terminal State Management
1. History Management
   - Memory usage growth from unconstrained history
   - Required fix: Proper cleanup and state reset

2. Selection State
   - Race conditions in selection updates
   - Focus management issues
   - Required fix: Proper state synchronization

3. Event Handling
   - Input focus management
   - Command execution timing
   - Required fix: Proper event coordination

### Focus Management
1. Focus Trap Issues
   - Cleanup timing problems
   - Event listener memory leaks
   - Required fix: Proper cleanup implementation

2. Focus History
   - Previous focus restoration issues
   - Focus stack management problems
   - Required fix: Proper focus state tracking

## Testing Requirements

### Unit Tests
1. State Stability
   - State transitions
   - Error recovery
   - Edge cases
   - Memory leak prevention

2. Cleanup Verification
   - Resource cleanup
   - Memory management
   - Error handling

3. Focus Management
   - Focus tracking
   - Trap/release cycles
   - Accessibility compliance

### Integration Tests
1. Component Interaction
   - Navigation/Terminal coordination
   - Focus/Navigation integration
   - Theme/Navigation transitions

2. Performance Tests
   - Memory usage
   - Render cycles
   - Event handling efficiency

3. Error Recovery
   - State recovery
   - Cleanup verification
   - Resource management

## Performance Considerations

1. State Updates
   - Batch related updates
   - Use stable references
   - Implement proper memoization
   - Monitor render cycles

2. Event Handling
   - Proper event cleanup
   - Use passive listeners
   - Implement proper cleanup
   - Monitor event frequency

3. Memory Management
   - Clear event listeners
   - Cancel animations
   - Reset state appropriately
   - Monitor memory usage

4. State Stability
   - Consistent state updates
   - Proper cleanup routines
   - Error boundaries
   - State recovery mechanisms
