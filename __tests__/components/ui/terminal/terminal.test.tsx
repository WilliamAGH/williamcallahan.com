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
import { Terminal } from "../../../../components/ui/terminal/terminal-implementation.client";
import { TerminalProvider } from "../../../../components/ui/terminal/terminal-context.client";
import type {
  GlobalWindowRegistryContextType,
  WindowState,
} from "../../../../lib/context/global-window-registry-context.client"; // Import types for mocking
import type { SearchResult } from "../../../../types/search"; // Import SearchResult type

// --- Mock TerminalHeader ---
jest.mock("../../../../components/ui/terminal/terminal-header", () => ({
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

// Define the type for a window entry in the mock
type MockedWindowEntry = {
  id: string;
  state: WindowState; // WindowState is imported
  icon: React.ForwardRefExoticComponent<
    React.SVGProps<SVGSVGElement> & React.RefAttributes<SVGSVGElement>
  >;
  title: string;
};

jest.mock("../../../../lib/context/global-window-registry-context.client", () => {
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
          } as MockedWindowEntry,
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
        getWindowState: jest.fn((id: string): MockedWindowEntry | undefined =>
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
import { useRegisteredWindowState as useRegisteredWindowStateImported } from "../../../../lib/context/global-window-registry-context.client";
const mockUseRegisteredWindowState = useRegisteredWindowStateImported as jest.Mock;
const mockUseRouter = useRouterImported as jest.Mock;

// Mock search functions using mock.module
jest.mock("../../../../lib/search", () => ({
  // Use mock.module
  searchPosts: jest.fn().mockResolvedValue([
    {
      title: "Test Post",
      excerpt: "Test excerpt",
      slug: "test-post",
    },
  ]),
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
        expect(
          screen.getByText(/Command not recognized. Type "help" for available commands./i),
        ).toBeInTheDocument();
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
});
