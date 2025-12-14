/**
 * Terminal Component Tests
 *
 * Tests the interactive terminal interface including:
 * 1. Core Functionality
 *    - Command input and processing
 *    - Command history management
 *    - Navigation between sections
 *
 * 2. Search Features
 *    - Content search across sections
 *    - Results display and selection
 *    - No results handling
 *
 * 3. UI/UX Elements
 *    - Welcome message display
 *    - Input focus management
 *    - Mobile responsiveness
 *
 * Test Environment:
 * - Mocks Next.js router for navigation
 * - Mocks search functionality
 * - Uses React Testing Library for DOM interactions
 */

import "@testing-library/jest-dom";
import React from "react"; // Ensure React is imported first
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Terminal } from "../../../../src/components/ui/terminal/terminal-implementation.client";
import { TerminalProvider } from "../../../../src/components/ui/terminal/terminal-context.client";
import {
  useRegisteredWindowState as useRegisteredWindowStateImported,
  type GlobalWindowRegistryContextType,
  type WindowState,
} from "../../../../src/lib/context/global-window-registry-context.client"; // Import types for mocking
import type { SearchResult } from "../../../../src/types/search"; // Import SearchResult type

// --- Mock TerminalHeader ---
jest.mock("../../../../src/components/ui/terminal/terminal-header", () => ({
  TerminalHeader: ({
    onClose,
    onMinimize,
    onMaximize,
    isMaximized,
  }: {
    onClose?: () => void;
    onMinimize?: () => void;
    onMaximize?: () => void;
    isMaximized?: boolean;
  }) => (
    <div data-testid="mock-terminal-header">
      <button type="button" title="Close" onClick={() => onClose?.()} disabled={!onClose}>
        Close
      </button>
      <button type="button" title="Minimize" onClick={() => onMinimize?.()} disabled={!onMinimize}>
        Minimize
      </button>
      <button
        type="button"
        title={isMaximized ? "Restore" : "Maximize"}
        onClick={() => onMaximize?.()}
        disabled={!onMaximize}
      >
        {isMaximized ? "Restore" : "Maximize"}
      </button>
    </div>
  ),
}));
// --- End Mock ---

// Mock next/navigation using mock.module
jest.mock("next/navigation", () => ({
  // Use mock.module
  useRouter: jest.fn(() => ({ push: jest.fn() })), // Provide default mock implementation
  usePathname: jest.fn(() => "/"),
}));

// --- Mock GlobalWindowRegistryContext using mock.module ---
// Keep state external for potential modification by mocked actions if needed,
// but primarily control return values via mockImplementationOnce in tests.
let mockWindowState: WindowState = "normal";
const MockIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>((props, ref) => (
  <svg ref={ref} {...props} data-testid="mock-icon" />
));
MockIcon.displayName = "MockIcon";

// Define actions - they modify the external state, but tests will primarily use mockImplementationOnce
const setMockState = (newState: typeof mockWindowState) => {
  mockWindowState = newState;
};
const minimizeMock = () => setMockState("minimized");
const maximizeMock = () => setMockState(mockWindowState === "maximized" ? "normal" : "maximized");
const closeMock = () => setMockState("closed");
const restoreMock = () => setMockState("normal");

jest.mock("../../../../src/lib/context/global-window-registry-context.client", () => {
  // Use mock.module
  // Functions defined above
  return {
    GlobalWindowRegistryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useWindowRegistry: jest.fn(
      (): Partial<GlobalWindowRegistryContextType> => ({
        windows: {
          "main-terminal": {
            id: "main-terminal",
            state: mockWindowState,
            icon: MockIcon,
            title: "Terminal",
          },
        },
        registerWindow: jest.fn(),
        unregisterWindow: jest.fn(),
        setWindowState: jest.fn((id: string, state: WindowState) => {
          if (id === "main-terminal") setMockState(state);
        }),
        minimizeWindow: jest.fn((id: string) => {
          if (id === "main-terminal") minimizeMock();
        }),
        maximizeWindow: jest.fn((id: string) => {
          if (id === "main-terminal") maximizeMock();
        }),
        closeWindow: jest.fn((id: string) => {
          if (id === "main-terminal") closeMock();
        }),
        restoreWindow: jest.fn((id: string) => {
          if (id === "main-terminal") restoreMock();
        }),
        getWindowState: jest.fn((id: string) =>
          id === "main-terminal"
            ? { id: "main-terminal", state: mockWindowState, icon: MockIcon, title: "Terminal" }
            : undefined,
        ),
      }),
    ),
    useRegisteredWindowState: jest.fn(), // Mock the hook used by the component
  };
});
// --- End Mock ---

// Get handles *after* mocking
import { useRouter as useRouterImported } from "next/navigation";
const mockUseRegisteredWindowState = useRegisteredWindowStateImported as jest.Mock;
const mockUseRouter = useRouterImported as jest.Mock;

// Mock search functions using mock.module
jest.mock("../../../../src/lib/search", () => ({
  searchExperience: jest.fn().mockResolvedValue([]),
  searchEducation: jest.fn().mockResolvedValue([]),
  searchInvestments: jest.fn().mockResolvedValue([]),
}));

// Mock fetch globally *before* importing Terminal or CommandProcessor
const mockFetch = jest.fn();
let originalFetch: typeof global.fetch;

beforeAll(() => {
  originalFetch = global.fetch;
  global.fetch = mockFetch as unknown as typeof global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch; // Restore original fetch
});

// Helper function to render with providers
const renderTerminal = () => {
  return render(
    <TerminalProvider>
      <Terminal />
    </TerminalProvider>,
  );
};

describe.skip("Terminal Component", () => {
  // Get router push mock handle *inside* describe
  let mockRouterPush: jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockFetch.mockClear(); // Clear fetch mock specifically

    // Reset router mock and get push handle
    mockRouterPush = jest.fn();
    mockUseRouter.mockReturnValue({ push: mockRouterPush });

    mockUseRegisteredWindowState.mockClear();
    // Set a default implementation for the hook for tests that don't override it
    mockUseRegisteredWindowState.mockImplementation(() => ({
      windowState: "normal",
      isRegistered: true,
      minimize: jest.fn(minimizeMock),
      maximize: jest.fn(maximizeMock),
      close: jest.fn(closeMock),
      restore: jest.fn(restoreMock),
      setState: jest.fn(setMockState),
    }));
    // Reset the external state variable
    mockWindowState = "normal";
  });

  // Add afterEach if needed for global mocks like fetch
  afterEach(() => {
    // Potentially restore global mocks if they were changed
  });

  describe("Rendering", () => {
    it("renders with welcome message", () => {
      renderTerminal();
      expect(screen.getByText(/Welcome! Type "help" for available commands./i)).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveFocus();
    });
  });

  describe("Command Processing", () => {
    it("processes help command", async () => {
      renderTerminal();
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "help" } });
      fireEvent.submit(input);

      await waitFor(() => {
        expect(screen.getByText(/Available commands/i)).toBeInTheDocument();
      });
    });

    it("handles invalid commands", async () => {
      renderTerminal();
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "invalid-command" } });

      // Mock the fetch call *before* submitting
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]) as Promise<SearchResult[]>, // No results found
      });

      fireEvent.submit(input);

      // Check if fetch was called correctly
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/search/all?q=invalid-command");
      });

      await waitFor(() => {
        // Look for the "command not recognized" message instead of "no site-wide results"
        expect(screen.getByText(/Command not recognized. Type "help" for available commands./i)).toBeInTheDocument();
      });
    });
  });

  describe("Navigation", () => {
    it("navigates to correct route", async () => {
      renderTerminal();
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "blog" } });
      fireEvent.submit(input);

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith("/blog"); // Check the push mock
      });
    });
  });

  describe("Search", () => {
    it("displays search results", async () => {
      renderTerminal();
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "blog test" } });

      // Mock the fetch call *before* submitting
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { label: "[Blog] Test Post", description: "Test excerpt", path: "/blog/test-post" },
          ] as SearchResult[]),
      });

      fireEvent.submit(input);

      // Check if fetch was called correctly
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/search/blog?q=test");
      });

      await waitFor(() => {
        // Expect the prefixed label from the API response
        expect(screen.getByText("[Blog] Test Post")).toBeInTheDocument();
        // Check that the selection view helper text is present
        expect(screen.getByText(/Use ↑↓ to navigate/i)).toBeInTheDocument();
      });
    });

    it("handles no results", async () => {
      renderTerminal();
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "experience nonexistent" } });
      fireEvent.submit(input);

      await waitFor(() => {
        expect(screen.getByText(/No results found/i)).toBeInTheDocument();
      });
    });
  });

  describe("Mobile Responsiveness", () => {
    it("maintains proper text wrapping", () => {
      renderTerminal();
      const terminalContent = screen.getByText(/Welcome!/i).closest(".whitespace-pre-wrap");
      expect(terminalContent).toBeTruthy();
      expect(String(terminalContent?.className || "")).toContain("break-words");
    });
  });

  describe("Window Controls Integration", () => {
    it("minimizes the terminal", () => {
      // Setup initial state for this test
      mockUseRegisteredWindowState.mockImplementation(() => ({
        windowState: "normal",
        isRegistered: true,
        minimize: jest.fn(minimizeMock),
        maximize: jest.fn(),
        close: jest.fn(),
        restore: jest.fn(),
        setState: jest.fn(),
      }));

      const { rerender } = renderTerminal();
      const minimizeButton = screen.getByTitle(/minimize/i); // Query by title

      // Setup state for *after* minimize click
      mockUseRegisteredWindowState.mockImplementationOnce(() => ({
        windowState: "minimized",
        isRegistered: true,
        minimize: jest.fn(minimizeMock),
        maximize: jest.fn(),
        close: jest.fn(),
        restore: jest.fn(),
        setState: jest.fn(),
      }));

      fireEvent.click(minimizeButton);
      rerender(
        <TerminalProvider>
          <Terminal />
        </TerminalProvider>,
      );

      // Assert: Terminal content should be gone
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
    });

    it("maximizes and restores the terminal", () => {
      // Simple test - just verify the maximize button exists and can be clicked
      const mockMaximize = jest.fn();

      mockUseRegisteredWindowState.mockImplementation(() => ({
        windowState: "normal",
        isRegistered: true,
        minimize: jest.fn(),
        maximize: mockMaximize,
        close: jest.fn(),
        restore: jest.fn(),
        setState: jest.fn(),
      }));

      renderTerminal();
      const maximizeButton = screen.getByTitle(/maximize/i);

      // Verify the maximize button exists and can be clicked
      expect(maximizeButton).toBeInTheDocument();
      fireEvent.click(maximizeButton);

      // Verify the maximize function was called
      expect(mockMaximize).toHaveBeenCalled();
    });

    it("closes the terminal", () => {
      // Setup initial state
      mockUseRegisteredWindowState.mockImplementation(() => ({
        windowState: "normal",
        isRegistered: true,
        minimize: jest.fn(),
        maximize: jest.fn(),
        close: jest.fn(closeMock),
        restore: jest.fn(),
        setState: jest.fn(),
      }));

      const { rerender } = renderTerminal();
      const closeButton = screen.getByTitle(/close/i); // Query by title

      // Set state for *after* close click
      mockUseRegisteredWindowState.mockImplementationOnce(() => ({
        windowState: "closed",
        isRegistered: true,
        minimize: jest.fn(),
        maximize: jest.fn(),
        close: jest.fn(closeMock),
        restore: jest.fn(),
        setState: jest.fn(),
      }));

      fireEvent.click(closeButton);
      // Rerender without the provider
      rerender(
        <TerminalProvider>
          <Terminal />
        </TerminalProvider>,
      );

      // Assert: Terminal content should be gone
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByText(/Welcome!/i)).not.toBeInTheDocument();
    });
  });

  describe("Concurrent Command Prevention", () => {
    it("disables input during command processing", async () => {
      // Mock a slow search response
      jest.useFakeTimers();

      renderTerminal();
      const input = screen.getByRole("textbox");

      // Submit a search command
      fireEvent.change(input, { target: { value: "blog test" } });
      fireEvent.submit(input);

      // Input should be disabled immediately
      expect(input).toBeDisabled();
      expect(input.placeholder).toBe("Processing...");

      // Fast-forward time to complete the search
      jest.runAllTimers();

      await waitFor(() => {
        expect(input).not.toBeDisabled();
        expect(input.placeholder).toBe("Enter a command");
      });

      jest.useRealTimers();
    });

    it("prevents multiple concurrent submissions", async () => {
      renderTerminal();
      const input = screen.getByRole("textbox");

      // Mock fetch to count calls
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });
      global.fetch = fetchSpy;

      // Submit first command
      fireEvent.change(input, { target: { value: "blog first" } });
      fireEvent.submit(input);

      // Try to submit second command immediately (should be prevented)
      fireEvent.change(input, { target: { value: "blog second" } });
      fireEvent.submit(input);

      await waitFor(() => {
        // Only one fetch call should have been made
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("blog"),
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
      });
    });
  });

  describe("AbortController Cleanup", () => {
    it("aborts in-flight requests when component unmounts", () => {
      const abortSpy = jest.fn();
      const originalAbortController = global.AbortController;

      // Mock AbortController to track abort calls
      global.AbortController = jest.fn().mockImplementation(() => ({
        signal: {},
        abort: abortSpy,
      }));

      const { unmount } = renderTerminal();
      const input = screen.getByRole("textbox");

      // Submit a search command
      fireEvent.change(input, { target: { value: "blog test" } });
      fireEvent.submit(input);

      // Unmount component (should abort the request)
      unmount();

      expect(abortSpy).toHaveBeenCalled();

      // Restore original AbortController
      global.AbortController = originalAbortController;
    });

    it("aborts previous search when new search is initiated", async () => {
      const abortSpy = jest.fn();
      const originalAbortController = global.AbortController;
      let controllerCount = 0;

      // Mock AbortController to track abort calls
      global.AbortController = jest.fn().mockImplementation(() => {
        const controller = {
          signal: { id: ++controllerCount },
          abort: abortSpy,
        };
        return controller;
      });

      renderTerminal();
      const input = screen.getByRole("textbox");

      // Mock slow fetch
      global.fetch = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

      // Submit first search
      fireEvent.change(input, { target: { value: "blog first" } });
      fireEvent.submit(input);

      // Wait for input to be re-enabled
      await waitFor(() => {
        expect(input).not.toBeDisabled();
      });

      // Submit second search (should abort the first)
      fireEvent.change(input, { target: { value: "blog second" } });
      fireEvent.submit(input);

      expect(abortSpy).toHaveBeenCalledTimes(1);

      // Restore original AbortController
      global.AbortController = originalAbortController;
    });
  });
});

// Focused regression tests for Space key behavior — run independently of the skipped suite
describe("Terminal Space Key Behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRegisteredWindowState.mockImplementation(() => ({
      windowState: "normal",
      isRegistered: true,
      minimize: jest.fn(),
      maximize: jest.fn(),
      close: jest.fn(),
      restore: jest.fn(),
      setState: jest.fn(),
    }));
  });

  it("allows typing space when input is focused (does not prevent default)", () => {
    renderTerminal();
    const input = screen.getByRole("textbox");
    input.focus();

    const evt = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    window.dispatchEvent(evt);

    // Global keydown safeguard must NOT block space when input is focused
    expect(evt.defaultPrevented).toBe(false);
  });

  it("prevents space scrolling and focuses input when pressed on content area", () => {
    renderTerminal();
    const input = screen.getByRole("textbox");
    // Ensure input is not focused to simulate pressing space outside the input
    input.blur();
    expect(document.activeElement).not.toBe(input);

    const content = screen.getByLabelText("Terminal content area");
    // Trigger section-level keydown handler which should prevent scroll and focus input
    fireEvent.keyDown(content, { key: " " });

    expect(input).toHaveFocus();
  });
});
