# Terminal GUI Architecture

## Overview
The terminal GUI is a complex interactive component that follows Next.js best practices for client/server component architecture. It provides a command-line interface experience while maintaining proper hydration and state management.

## Component Structure

```
components/ui/terminal/
├── terminal.server.tsx     # Server-side shell
├── terminal.client.tsx     # Interactive features
├── commandInput.client.tsx # Input handling
├── terminalContext.tsx     # Client-side state
└── navigationCommands.tsx  # Command processing
```

## Component Relationships

### Server Components
- `terminal.server.tsx`
  - @see {@link "components/ui/terminal/terminal.client.tsx"} - Client-side terminal functionality
  - @see {@link "components/ui/terminal/terminalContext.tsx"} - Terminal state management
  - Provides static shell for terminal UI
  - Handles SEO-relevant markup
  - Wraps client components

### Client Components
- `terminal.client.tsx`
  - @see {@link "components/ui/terminal/terminalContext.tsx"} - Required context provider
  - @see {@link "components/ui/terminal/commandInput.client.tsx"} - Input handling
  - @see {@link "components/ui/terminal/navigationCommands.tsx"} - Command processing
  - Handles interactive features
  - Manages command execution
  - Controls terminal state
  - Selection mode (under development)
    - Currently being stabilized
    - Tests temporarily disabled
    - See terminal.test.tsx for expected behavior

- `commandInput.client.tsx`
  - @see {@link "components/ui/terminal/terminal.client.tsx"} - Parent component
  - @see {@link "components/ui/terminal/terminalContext.tsx"} - Context consumer
  - Handles user input
  - Manages input state
  - Controls input focus

- `terminalContext.tsx`
  - @see {@link "app/clientComponents/providers/terminal.tsx"} - Root provider
  - Provides terminal state management
  - Handles command processing
  - Manages history state

## State Management

### Client-Side State
- Terminal state lives in `terminalContext.tsx`
- Input state managed by `commandInput.client.tsx`
- History state handled by context
- All interactive state is client-only

### Server/Client Boundary
- Server components provide static structure
- Client components handle all interactivity
- Context stays on client side
- Props flow from server to client

## Hydration Strategy

### Server-Side
- Static shell renders first
- SEO-friendly markup
- No interactive elements
- No state management

### Client-Side
- Hydrates interactive elements
- Manages all state
- Handles user input
- Processes commands

## Best Practices

1. Component Organization
   - Clear separation of server/client concerns
   - Proper use of 'use client' directives
   - Minimal prop drilling
   - Context for shared state

2. State Management
   - Client-side state isolation
   - Context for shared state
   - Clean state updates
   - Proper cleanup

3. Performance
   - Server-side static content
   - Minimal client JavaScript
   - Efficient re-renders
   - Proper memoization

4. Testing
   - @see {@link "__tests__/components/ui/terminal/terminal.test.tsx"} - Terminal tests
   - @see {@link "__tests__/components/ui/terminal/commandInput.test.tsx"} - Input tests
   - @see {@link "__tests__/components/ui/terminal/terminalContext.test.tsx"} - Context tests
   - @see {@link "__tests__/lib/setup/terminal.tsx"} - Test utilities

## Usage Example

```tsx
// In a page component
import { Terminal } from './terminal.server';

export default function Page() {
  return (
    <Terminal
      initialData={...}
      config={...}
    />
  );
}
```

## Related Documentation
- @see {@link "docs/development/best-practices.md"} - Development guidelines
- @see {@link "docs/architecture/state-management.md"} - State management patterns
- @see {@link "docs/development/testing.md"} - Testing strategies
