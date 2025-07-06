# Terminal Architecture Map

## Overview

The "terminal" functionality encompasses components and utilities that manage the display, interaction, and state of terminal-like interfaces within the application. This includes UI elements for terminal windows, input handling, and state management for a cohesive user experience.

**Non-negotiable UX rule:** The terminal **MUST** register with a default window state of `normal`. It should never begin in `closed` or `minimized` states, as that hides the primary interactive surface from users. Any future change to this default requires explicit product owner approval.

## Key Files and Responsibilities

### Core Terminal Components

- **components/ui/terminal/terminal-implementation.client.tsx**: Main orchestrator component managing terminal appearance, state integration, and window behaviors. Handles layout (normal vs maximized), event handling, and scroll behavior.
- **components/ui/terminal/terminal-loader.client.tsx**: Dynamic loading component that provides a skeleton matching the exact initial state of the terminal (including welcome message) to prevent layout shifts during loading.
- **components/ui/terminal/terminal.client.tsx**: Wrapper component that exports the lazy-loaded terminal implementation.
- **components/ui/terminal/terminal-header.tsx**: Simple presentational component for window controls and title display.
- **components/ui/terminal/terminal-context.client.tsx**: Manages terminal-specific state (command history) with sessionStorage persistence. Provides history management and clearing functionality. Always initializes with a welcome message.
- **components/ui/terminal/command-input.client.tsx**: Handles user input with iOS Safari zoom prevention using CSS transforms. Manages command submission.
- **components/ui/terminal/history.tsx**: Displays command history with proper formatting and styling.
- **components/ui/terminal/selection-view.client.tsx**: Interactive list for search results with keyboard navigation (arrow keys, enter, escape). Handles visual selection feedback.
- **components/ui/terminal/use-terminal.client.ts**: Custom hook orchestrating terminal functionality - input state, command submission, selection handling, and navigation integration.

### Supporting Components

- **components/ui/shell-parent-tabs.client.tsx**: Provides shell-like tabbed interface for terminal interactions.
- **components/features/blog-article/software-schema.tsx**: Easter egg command that inserts SoftwareApplication schema.org metadata.

### State Management

- **lib/context/terminal-window-state-context.client.tsx**: React context for managing shared state of terminal window (normal, minimized, maximized, closed).

### Type Definitions

- **types/terminal.ts**: TypeScript definitions for TerminalCommand, SelectionItem, CommandResult, and SearchResult interfaces.

## Logic Flow and Interactions

### Command Processing Flow

```
User Input → CommandInput → useTerminal → commands.client.ts
                                  ↓
                          TerminalContext (history)
                                  ↓
                              History Component
```

### Window State Management Flow

```
Window Controls → TerminalHeader → GlobalWindowRegistry
                                          ↓
                              TerminalImplementation (visibility/state)
```

### Key Interactions

1. **User Input**: CommandInput captures user commands, prevents iOS zoom issues
2. **Command Processing**: useTerminal hook processes input through commands.client.ts
3. **History Management**: TerminalContext persists history in sessionStorage
4. **Search Results**: SelectionView provides keyboard-navigable results
5. **Window States**: GlobalWindowRegistry coordinates minimize/maximize/close actions
6. **Navigation**: Commands can trigger navigation to different pages
7. **API Integration**: Search commands communicate with /api/search endpoints

## Architecture Strengths

- **Separation of Concerns**: Command logic completely decoupled from React components
- **Robust State Management**: Multi-layered approach with appropriate scope for each state type
- **Window Management Pattern**: Scalable system supporting multiple window-like components
- **Error Resilience**: Comprehensive error handling throughout
- **Performance Optimizations**: Code splitting, memoization, efficient DOM operations
- **Session Persistence**: History preserved within session using sessionStorage

## Implementation Details

### Keyboard/Mouse Mode Switching

The SelectionView component implements a modal navigation system similar to terminal emulators (WezTerm, tmux):

- **Keyboard Mode**: Activated by arrow keys, completely disables mouse hover visual feedback
- **Mouse Mode**: Activated by mouse movement or clicks
- **Mode Isolation**: Uses CSS `pointer-events: none` in keyboard mode to prevent hover states
- **Clear Visual Indicators**: Shows which navigation mode is currently active
- **Binary State Management**: Ensures only one input method is active at a time

### Performance Optimizations

- **Lazy Loading**: Search module loads on-demand to keep initial bundle small
- **Event Listener Management**: Keyboard listeners are properly scoped and cleaned up
- **Memoization**: Heavy computations cached to prevent unnecessary recalculations
- **Efficient DOM Updates**: Minimal re-renders through careful state management

### Type Safety Approach

- **Zod Validation**: All API responses validated at runtime
- **Type Guards**: External data verified before use
- **Strict TypeScript**: No implicit any types or unsafe assertions
- **Comprehensive Interfaces**: All data structures fully typed

### Accessibility Features

- **ARIA Patterns**: Selection list implements proper listbox/option roles
- **Screen Reader Support**: Full navigation announcements
- **Keyboard Navigation**: Complete keyboard-only operation support
- **Focus Management**: Proper focus trapping and restoration

### Event Management Strategy

- **Scoped Listeners**: Keyboard events bound to terminal container, not global
- **Event Delegation**: Efficient handling of dynamic content
- **Conflict Prevention**: Window state changes coordinated through GlobalWindowRegistry
- **Clean Lifecycle**: All listeners properly removed on unmount

### Loading State Implementation

- **Skeleton Accuracy**: The skeleton component (terminal-loader.client.tsx) exactly mirrors the initial state of the terminal, including the welcome message
- **Layout Shift Prevention**: By matching the skeleton's content to the actual initial state, we prevent Cumulative Layout Shift (CLS) issues
- **Dynamic Import**: Terminal is lazy-loaded with Next.js dynamic() and ssr: false for client-side rendering
- **Consistent Sizing**: Both skeleton and actual terminal use identical padding, margins, and max-height values
