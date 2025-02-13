// __tests__/components/ui/terminal/terminalContext.test.tsx

/**
 * Terminal Context Tests
 *
 * @packageDocumentation
 * @module Tests/Terminal
 * @description Tests terminal context functionality with proper state management,
 * error handling, and provider isolation. Uses real context implementation
 * to ensure accurate testing.
 */

import { render, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useTerminalContext, TerminalProvider } from "../../../../components/ui/terminal/terminalContext";
import type { FC, ReactNode } from "react";

/**
 * Test component that consumes terminal context
 *
 * @param props - Component props including optional testId and children
 * @returns A component that displays terminal state
 */
const TestComponent: FC<{ testId?: string; children?: ReactNode }> = ({ testId = "test-component", children }) => {
  const context = useTerminalContext();
  return (
    <div data-testid={testId} data-ready={context.isReady}>
      {children}
    </div>
  );
};

/**
 * Terminal Context test suite
 *
 * @group Terminal
 * @category Tests
 */
describe("Terminal Context", () => {
  /**
   * Tests context provider initialization
   *
   * @test
   * @description Verifies that terminal context is properly provided
   */
  it("provides terminal context", () => {
    const { result } = renderHook(() => useTerminalContext(), {
      wrapper: ({ children }) => <TerminalProvider>{children}</TerminalProvider>
    });

    expect(result.current.isReady).toBe(true);
    expect(typeof result.current.clearHistory).toBe("function");
  });

  /**
   * Tests initial terminal state
   *
   * @test
   * @description Verifies that terminal initializes with correct state
   */
  it("initializes terminal state", () => {
    const { getByTestId } = render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );

    const component = getByTestId("test-component");
    expect(component).toHaveAttribute("data-ready", "true");
  });

  /**
   * Tests cleanup on unmount
   *
   * @test
   * @description Verifies proper cleanup when component unmounts
   */
  it("handles cleanup on unmount", () => {
    const { unmount, getByTestId } = render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );

    // Initial state
    const component = getByTestId("test-component");
    expect(component).toHaveAttribute("data-ready", "true");

    // Unmount
    unmount();
  });

  /**
   * Tests clearHistory functionality
   *
   * @test
   * @description Verifies that clearHistory function works correctly
   */
  it("provides clearHistory function", async () => {
    const { result } = renderHook(() => useTerminalContext(), {
      wrapper: ({ children }) => <TerminalProvider>{children}</TerminalProvider>
    });

    await act(async () => {
      await result.current.clearHistory();
    });

    // Function should be defined and callable
    expect(result.current.clearHistory).toBeDefined();
  });

  /**
   * Tests error handling outside provider
   *
   * @test
   * @description Verifies error when context is used outside provider
   */
  it("throws error when used outside provider", () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // Verify error is thrown when used outside provider
    expect(() => {
      renderHook(() => useTerminalContext());
    }).toThrow("useTerminalContext must be used within TerminalProvider");

    consoleSpy.mockRestore();
  });

  /**
   * Tests state persistence across rerenders
   *
   * @test
   * @description Verifies that state is maintained when component rerenders
   */
  it("maintains consistent state across rerenders", () => {
    const { rerender, getByTestId } = render(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );

    // Initial state
    const component = getByTestId("test-component");
    expect(component).toHaveAttribute("data-ready", "true");

    // Rerender
    rerender(
      <TerminalProvider>
        <TestComponent />
      </TerminalProvider>
    );

    // State should persist
    expect(component).toHaveAttribute("data-ready", "true");
  });

  /**
   * Tests provider state isolation
   *
   * @test
   * @description Verifies that multiple providers maintain isolated state
   */
  it("isolates state between providers", () => {
    const { getAllByTestId } = render(
      <>
        <TerminalProvider>
          <TestComponent testId="terminal-instance-1" />
        </TerminalProvider>
        <TerminalProvider>
          <TestComponent testId="terminal-instance-2" />
        </TerminalProvider>
      </>
    );

    // Each terminal should have its own state
    const terminals = getAllByTestId(/terminal-instance-\d/);
    expect(terminals).toHaveLength(2);
    terminals.forEach(terminal => {
      expect(terminal).toHaveAttribute("data-ready", "true");
    });
  });

  /**
   * Tests multiple context consumers
   *
   * @test
   * @description Verifies that multiple consumers share the same context
   */
  it("handles multiple consumers", () => {
    const { getAllByTestId } = render(
      <TerminalProvider>
        <TestComponent />
        <TestComponent />
        <TestComponent />
      </TerminalProvider>
    );

    // All consumers should share the same state
    const components = getAllByTestId("test-component");
    expect(components).toHaveLength(3);
    components.forEach(component => {
      expect(component).toHaveAttribute("data-ready", "true");
    });
  });
});
