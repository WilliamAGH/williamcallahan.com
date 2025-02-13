/**
 * @module components/ui/terminal
 * Terminal Component Exports
 *
 * IMPORTANT: This file provides a clear boundary between server and client components.
 * To avoid hydration issues and circular dependencies:
 *
 * 1. Server Components:
 *    - Import from './server'
 *    - Can only use other server components
 *    - Cannot import from './client'
 *    - Cannot use hooks or client-side features
 *
 * 2. Client Components:
 *    - Import from './client'
 *    - Must be marked with 'use client'
 *    - Can use both client and server components
 *    - Can use hooks and browser APIs
 *
 * 3. Import Rules:
 *    - Pages/Server Components → import { Terminal } from '@/components/ui/terminal/server'
 *    - Client Components → import { TerminalClient, ... } from '@/components/ui/terminal/client'
 *    - Tests → import { Terminal } from '@/components/ui/terminal/server'
 *           → import { TerminalClient } from '@/components/ui/terminal/client'
 *
 * @module components/ui/terminal
 * @see {@link "docs/architecture/terminalGUI.md"} - Terminal architecture documentation
 */

// Re-export everything but with clear boundaries
export * from './server';  // Server-side exports
export * from './client';  // Client-side exports

// Note: While this file re-exports everything for convenience,
// it's recommended to import directly from ./server or ./client
// to make the component boundaries explicit in your code.
