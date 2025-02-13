/**
 * Test Setup Types Module
 *
 * Defines TypeScript types and interfaces used in test setup utilities.
 * These types help ensure consistent test configuration and mocking.
 *
 * @module __tests__/lib/setup/types
 * @see {@link Terminal} - Terminal component being tested
 * @see {@link TerminalProvider} - Terminal context provider
 * @see {@link CommandResult} - Terminal command result type
 */

import { RenderOptions } from "@testing-library/react";
import type { CommandResult } from "@/types/terminal";

/**
 * Mock type for terminal command handler function
 * @see {@link handleCommand} - Original command handler function
 */
export type MockHandleCommand = jest.Mock<Promise<CommandResult>>;

/**
 * Extended render options for terminal component tests
 * Includes additional configuration for terminal provider and command handling
 *
 * @interface TestRenderOptions
 * @extends {Omit<RenderOptions, "wrapper">}
 *
 * @property {boolean} [withTerminalProvider] - Whether to wrap component with TerminalProvider
 * @property {object} [initialState] - Initial state for TerminalProvider
 * @property {boolean} [initialState.isReady] - Whether terminal is ready for input
 * @property {MockHandleCommand} [initialState.handleCommand] - Mock command handler function
 * @property {object} [commandResult] - Mock command execution result
 * @property {boolean} [commandResult.clear] - Whether command clears history
 * @property {any[]} [commandResult.results] - Command output results
 *
 * @see {@link TerminalProvider} - Context provider that uses these options
 * @see {@link Terminal} - Component that uses the provider
 */
export interface TestRenderOptions extends Omit<RenderOptions, "wrapper"> {
  withTerminalProvider?: boolean;
  initialState?: {
    isReady?: boolean;
    handleCommand?: MockHandleCommand;
  };
  commandResult?: {
    clear?: boolean;
    results: any[];
  };
}
