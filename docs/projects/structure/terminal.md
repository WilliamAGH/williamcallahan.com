# Terminal Architecture Map

## Overview

The "terminal" functionality encompasses components and utilities that manage the display, interaction, and state of terminal-like interfaces within the application. This includes UI elements for terminal windows, input handling, and state management for a cohesive user experience.

**Non-negotiable UX rule:** The terminal **MUST** register with a default window state of `normal`. It should never begin in `closed` or `minimized` states, as that hides the primary interactive surface from users. Any future change to this default requires explicit product owner approval.

## Key Files and Responsibilities

### Core Terminal Components

- **components/ui/terminal/terminal-implementation.client.tsx**: Main orchestrator component managing terminal appearance, state integration, and window behaviors. Handles layout (normal vs maximized), event handling, and scroll behavior.
- **components/ui/terminal/terminal-header.tsx**: Simple presentational component for window controls and title display.
- **components/ui/terminal/terminal-context.client.tsx**: Manages terminal-specific state (command history) with sessionStorage persistence. Provides history management and clearing functionality.
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

## Known Issues & Improvements

### Performance

- All commands wait for search module to load, even simple ones like 'help'
- SelectionView recreates keyboard listeners on every selection change

### Type Safety

- API responses use blind type assertions without runtime validation
- Missing type guards for external data

### Accessibility

- Selection list lacks proper ARIA patterns (listbox/option roles)
- Screen reader experience needs enhancement

### Event Management

- Global keyboard listeners could conflict between SelectionView and maximized terminal
- Listeners should be scoped to terminal container

### Implementation Details

- Fixed 100ms timeout for scroll-to-hash could fail on slow devices
- Test file is currently skipped and needs updating
