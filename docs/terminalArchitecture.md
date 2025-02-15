# Terminal GUI Architecture

This document outlines the architecture of the terminal GUI system in the website. The terminal is a complex interactive component that simulates a command-line interface with custom commands and interactions.

## Component Classification

### Client Components (use client)
- `/components/ui/terminal/terminalContext.tsx`
- `/components/ui/terminal/terminal.tsx`
- `/components/ui/terminal/command-input.tsx`
- `/components/ui/terminal/command-interface.tsx`
- `/components/ui/terminal/history.tsx`
- `/components/ui/terminal/terminal-history.tsx`
- `/components/ui/terminal/selection-view.tsx`
- `/app/providers.tsx`

### Server Components
- None (all components are client-side due to interactive nature)
- VERIFY we didn't accidentially setup a server side component

### Utilities and Hooks (Client-side)
- `/components/ui/terminal/use-terminal.ts`
- `/components/ui/terminal/commands.ts`
- `/components/ui/terminal/terminal-commands.ts`
- `/components/ui/terminal/sections.ts`
- `/components/ui/terminal/types.ts`

## Core Components

### State Management

#### `/components/ui/terminal/terminalContext.tsx`
The central state management for the terminal. Provides a React context that manages:
- Command history
- Hydration state
- History manipulation methods
Consumed by navigation components and the terminal interface.

#### `/components/ui/terminal/use-terminal.ts`
Custom hook that manages terminal state and interactions:
- Input handling
- Command execution
- Selection state
- History management
Used by the main Terminal component to handle all interactions.

### UI Components

#### `/components/ui/terminal/terminal.tsx`
The main terminal component that orchestrates all subcomponents:
- Renders the terminal window
- Integrates with `/components/ui/navigation/window-controls.tsx`
- Manages layout and styling
- Coordinates between history, input, and selection views

#### `/components/ui/terminal/command-input.tsx`
Handles user input in the terminal:
- Text input management
- Command submission
- Integration with terminal state
Used within the main Terminal component for command entry.

#### `/components/ui/terminal/command-interface.tsx`
Manages the command execution interface:
- Command parsing
- Response formatting
- Error handling
Used by `/components/ui/terminal/use-terminal.ts` to process commands.

#### `/components/ui/terminal/history.tsx` and `/components/ui/terminal/terminal-history.tsx`
(Note: These appear to be duplicate files that need consolidation)
Display the command history:
- Render previous commands and outputs
- Handle history styling
Used within the Terminal component to show command history.

#### `/components/ui/terminal/selection-view.tsx`
Handles interactive selection menus:
- Displays selectable options
- Manages selection state
- Handles selection callbacks
Used when commands present multiple options to the user.

---------------------------------------------------------------------
### Command System

#### `/components/ui/terminal/commands.ts`
Defines available terminal commands:
- Command definitions
- Command handlers
- Help text
Used by `/components/ui/terminal/command-interface.tsx` to execute commands.

#### `/components/ui/terminal/terminal-commands.ts`
(Note: Possible duplicate of commands.ts)
Additional command definitions and utilities.

#### `/components/ui/terminal/sections.ts`
Defines terminal UI sections:
- Section types
- Section layouts
- Section interactions
Used for organizing terminal output.

### Types and Utilities

#### `/components/ui/terminal/types.ts`
Core type definitions:
- Command interfaces
- History types
- Terminal state types
Used throughout the terminal system for type safety.

## Component Interactions

1. **State Flow**:
   ```
   /components/ui/terminal/terminalContext.tsx
   ├─> /components/ui/terminal/terminal.tsx
   │   ├─> /components/ui/terminal/history.tsx
   │   ├─> /components/ui/terminal/command-input.tsx
   │   └─> /components/ui/terminal/selection-view.tsx
   ```

2. **Command Flow**:
   ```
   /components/ui/terminal/command-input.tsx
   ├─> /components/ui/terminal/use-terminal.ts
   │   ├─> /components/ui/terminal/command-interface.tsx
   │   │   ├─> /components/ui/terminal/commands.ts
   │   │   └─> /components/ui/terminal/terminal-commands.ts
   │   └─> /components/ui/terminal/terminalContext.tsx (for history)
   ```

3. **Selection Flow**:
   ```
   /components/ui/terminal/command-interface.tsx
   ├─> /components/ui/terminal/use-terminal.ts
   │   ├─> /components/ui/terminal/selection-view.tsx
   │   └─> /components/ui/terminal/terminalContext.tsx
   ```

4. **Navigation Flow**:
   ```mermaid
   graph TD
       A[User Input] --> B[terminal-commands.ts]
       B --> C{Command Match?}
       C -->|Yes| D[onNavigate Callback]
       D --> E[Router Navigation]
       C -->|No| F[Error Message]

       G[Selection UI] --> H[selection-view.tsx]
       H --> I[Keyboard Navigation]
       I --> D
   ```

## Issues to Address

1. **File Consolidation Needed**:
   - `history.tsx` and `terminal-history.tsx` should be merged
   - `commands.ts` and `terminal-commands.ts` should be consolidated

2. **Naming Consistency**:
   - Some files use hyphenated names while others use camelCase (there should be no hypenated nor snake_case names in our Next.js repo, only camelCase)

3. **Component Responsibilities**:
   - Some components may have overlapping responsibilities
   - Consider refactoring for clearer separation of concerns

## Usage in Application

The terminal system is integrated into the main application through:
1. The Providers system (`app/providers.tsx`)
2. The root layout (`app/layout.tsx`)
3. Navigation integration for command-based navigation

## Recommendations

1. **Immediate**:
   - Consolidate duplicate files
   - Standardize naming conventions
   - STABILIZE THE REPO - IT DOESN'T WORK DUE TO THIS
   - DISABLE TERMINAL TEMPORARILY IF DUPLICATE FILES FIX DOESN'T WORK
   - Improve hydration handling

2. **Short-term**:
   - Add proper error boundaries
   - Improve type safety
   - Add comprehensive tests

3. **Long-term**:
   - Consider splitting into smaller, more focused components
   - Add proper documentation comments
   - Create a command plugin system

## Implementation Details

### State Management

#### `/components/ui/terminal/use-terminal.ts` Implementation
```typescript
// Key States
const [input, setInput] = useState('');
const [history, setHistory] = useState<TerminalCommand[]>();
const [selection, setSelection] = useState<SelectionItem[] | null>(null);

// Core Functions
1. handleSubmit:
   - Processes command input
   - Integrates with command system
   - Updates history
   - Handles navigation
   - Manages selection state

2. handleSelection:
   - Processes selection choices
   - Handles navigation
   - Manages smooth scrolling for anchors

3. State Management:
   - Maintains MAX_HISTORY limit
   - Provides clear history functionality
   - Manages input focus
```

### Command Flow Details

1. **Input Processing**:
   ```
   handleSubmit
   ├─> Validate input
   ├─> Add to history
   ├─> Process command
   │   ├─> Clear terminal
   │   ├─> Show selection
   │   └─> Navigate
   └─> Handle errors
   ```

2. **Selection Processing**:
   ```
   handleSelection
   ├─> Clear selection state
   ├─> Navigate if path exists
   └─> Scroll to anchor if needed
   ```

## Command System Implementation

### Command Handler (`commands.ts`)

```typescript
// Available Commands
1. System Commands:
   - help    : Display help message
   - clear   : Clear terminal history

2. Navigation Commands:
   - home
   - investments
   - experience
   - education
   - blog

3. Search Commands:
   Format: <section> <search terms>
   Example: investments fintech
```

### Command Processing Flow

1. **Input Processing**:
   ```
   handleCommand(input)
   ├─> Split into command and args
   ├─> Validate command type
   │   ├─> System command (help, clear)
   │   ├─> Navigation command
   │   └─> Search command
   └─> Return CommandResult
   ```

2. **Search Implementation**:
   ```
   Section Search
   ├─> Validate section
   ├─> Process search terms
   ├─> Call section-specific search
   │   ├─> searchPosts
   │   ├─> searchExperience
   │   ├─> searchEducation
   │   ├─> searchInvestments
   │   ├─> searchBlog
   │   └─> searchBlog
   └─> Format results
   ```

3. **Result Types**:
   ```typescript
   interface CommandResult {
     results: Array<{input: string, output: string}>;
     clear?: boolean;
     navigation?: string;
     selectionItems?: SearchResult[];
   }
   ```

### Integration Points

1. **Search System**:
   - Integrates with `/lib/search`
   - Section-specific search implementations
   - Result formatting for display

2. **Navigation**:
   - Uses section definitions from `sections.ts`
   - Handles path-based navigation
   - Supports search result navigation

3. **UI Feedback**:
   - Provides user feedback messages
   - Handles empty results
   - Formats help text
```

## Application Integration

### Provider Integration
- `/app/providers.tsx`: Wraps the application with terminal context
- `/app/layout.tsx`: Integrates terminal into the root layout
- `/components/ui/navigation/*.tsx`: Integrates with command-based navigation

### Search Integration
- `/lib/search.ts`: Provides search functionality for different sections
- `/types/terminal.ts`: Defines shared types between terminal and search

## Search Functionality

The terminal includes a robust search system that allows users to search through different sections of content. The search functionality is implemented through several interconnected files:

### Core Search Implementation
- `/lib/search.ts`: Contains the core search implementations with the following exports:
  - `searchPosts`: Searches through blog posts
  - `searchExperience`: Searches through work experience entries
  - `searchEducation`: Searches through education and certification entries
  - `searchInvestments`: Searches through investment entries

### Search Integration with Terminal
- `/components/ui/terminal/commands.ts`: Integrates search functionality into the terminal by:
  - Importing search functions from `/lib/search.ts`
  - Processing search commands and displaying results
  - Handling section-specific search routing

### Data Sources
Search functionality pulls from the following data files:
- `/data/blog/posts.ts`: Blog post data
- `/data/experience.ts`: Work experience data
- `/data/education.ts`: Education and certification data
- `/data/investments.ts`: Investment data

### Type Definitions
- `/types/blog.ts`: Defines `BlogPost` type used in search results
- `/types/search.ts`: Defines `SearchResult` type used across all search functions

### Search Flow
1. User enters a search command in the terminal (e.g., `search posts react`)
2. The command is processed in `/components/ui/terminal/commands.ts`
3. Based on the section specified, the appropriate search function from `/lib/search.ts` is called
4. Results are formatted and displayed in the terminal interface

### Testing
- `/__tests__/lib/search.test.ts`: Contains comprehensive tests for all search functions
- `/__tests__/components/ui/terminal/terminal.test.tsx`: Tests terminal integration with search functionality

## Navigation System

The terminal includes a navigation system that allows users to move through the site using terminal commands. The navigation functionality is implemented through several interconnected files:

### Core Navigation Implementation
- `/components/ui/terminal/terminal-commands.ts`: Contains the mapping of terminal commands to application routes
  - Defines a constant object `terminalCommands` that maps command keywords to their corresponding routes
  - Supports navigation to main sections (home, blog, experience, etc.)
  - Includes shortcuts to specific sections within pages (e.g., specific experience entries)

### Navigation Integration
- `/components/ui/terminal/types.ts`: Defines the navigation interface
  - Includes `onNavigate` callback type for handling navigation events
  - Used by terminal components to implement navigation functionality

### Navigation UI Components
- `/components/ui/terminal/selection-view.tsx`: Provides the UI for navigable selections
  - Displays navigation instructions ("Use ↑↓ to navigate, Enter to select, Esc to cancel")
  - Handles keyboard navigation through options
  - Triggers navigation callbacks when selections are made

### Navigation Flow
1. User enters a navigation command or selects an option
2. The command is matched against `terminalCommands` mapping
3. If a match is found, the `onNavigate` callback is triggered with the corresponding route
4. The application router handles the actual navigation to the new route

### Testing
- `/__tests__/components/ui/terminal/terminal.test.tsx`: Tests navigation functionality
  - Verifies correct route navigation
  - Tests navigation instructions display
  - Ensures keyboard navigation works as expected

[Rest of previous content with updated paths...]