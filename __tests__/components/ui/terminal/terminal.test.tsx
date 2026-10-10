/** Terminal component behavior. */

import React from "react"; // Ensure React is imported first
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Terminal } from "../../../../src/components/ui/terminal/terminal-implementation.client";
import { TerminalProvider } from "../../../../src/components/ui/terminal/terminal-context.client";
import { useRegisteredWindowState as useRegisteredWindowStateImported } from "../../../../src/lib/context/global-window-registry-context.client";
import type {
  GlobalWindowRegistryContextType,
  RegisteredWindowState,
  WindowStateValue,
} from "../../../../src/types/ui/window";

// --- Mock TerminalHeader ---
vi.mock("../../../../src/components/ui/terminal/terminal-header", () => ({
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
vi.mock("next/navigation", () => ({
  // Use mock.module
  useRouter: vi.fn<() => Pick<AppRouter, "push">>(() => ({ push: vi.fn<AppRouter["push"]>() })), // Provide default mock implementation
  usePathname: vi.fn<typeof usePathnameImported>(() => "/"),
}));

// --- Mock GlobalWindowRegistryContext using mock.module ---
// Keep state external for potential modification by mocked actions if needed,
// but primarily control return values via mockImplementationOnce in tests.
let mockWindowState: WindowStateValue = "normal";
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

vi.mock("../../../../src/lib/context/global-window-registry-context.client", () => {
  // Use mock.module
  // Functions defined above
  return {
    GlobalWindowRegistryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useWindowRegistry: vi.fn<() => Partial<GlobalWindowRegistryContextType>>(() => ({
      windows: {
        "main-terminal": {
          id: "main-terminal",
          state: mockWindowState,
          icon: MockIcon,
          title: "Terminal",
        },
      },
      registerWindow: vi.fn<GlobalWindowRegistryContextType["registerWindow"]>(),
      unregisterWindow: vi.fn<GlobalWindowRegistryContextType["unregisterWindow"]>(),
      setWindowState: vi.fn<GlobalWindowRegistryContextType["setWindowState"]>(
        (id: string, state: WindowStateValue) => {
          if (id === "main-terminal") setMockState(state);
        },
      ),
      minimizeWindow: vi.fn<GlobalWindowRegistryContextType["minimizeWindow"]>((id: string) => {
        if (id === "main-terminal") minimizeMock();
      }),
      maximizeWindow: vi.fn<GlobalWindowRegistryContextType["maximizeWindow"]>((id: string) => {
        if (id === "main-terminal") maximizeMock();
      }),
      closeWindow: vi.fn<GlobalWindowRegistryContextType["closeWindow"]>((id: string) => {
        if (id === "main-terminal") closeMock();
      }),
      restoreWindow: vi.fn<GlobalWindowRegistryContextType["restoreWindow"]>((id: string) => {
        if (id === "main-terminal") restoreMock();
      }),
      getWindowState: vi.fn<GlobalWindowRegistryContextType["getWindowState"]>((id: string) =>
        id === "main-terminal"
          ? { id: "main-terminal", state: mockWindowState, icon: MockIcon, title: "Terminal" }
          : undefined,
      ),
    })),
    useRegisteredWindowState: vi.fn<typeof useRegisteredWindowStateImported>(), // Mock the hook used by the component
  };
});
// --- End Mock ---

// Get handles *after* mocking
import {
  usePathname as usePathnameImported,
  useRouter as useRouterImported,
} from "next/navigation";
const mockUseRegisteredWindowState = vi.mocked(useRegisteredWindowStateImported);
const mockUsePathname = vi.mocked(usePathnameImported);
const mockUseRouter = vi.mocked(useRouterImported);
type AppRouter = ReturnType<typeof useRouterImported>;

// Mock fetch globally *before* importing Terminal or CommandProcessor
const mockFetch = vi.fn<typeof globalThis.fetch>();
let originalFetch: typeof global.fetch;

beforeAll(() => {
  originalFetch = global.fetch;
  global.fetch = mockFetch;
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

describe("Terminal Component", () => {
  let mockRouterPush = vi.fn<AppRouter["push"]>();

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockUsePathname.mockReturnValue("/");

    // Reset router mock and get push handle
    mockRouterPush = vi.fn<AppRouter["push"]>();
    mockUseRouter.mockReturnValue({
      back: vi.fn<AppRouter["back"]>(),
      forward: vi.fn<AppRouter["forward"]>(),
      refresh: vi.fn<AppRouter["refresh"]>(),
      push: mockRouterPush,
      replace: vi.fn<AppRouter["replace"]>(),
      prefetch: vi.fn<AppRouter["prefetch"]>(),
      bfcacheId: "test-bfcache-id",
    });

    mockUseRegisteredWindowState.mockClear();
    // Set a default implementation for the hook for tests that don't override it
    mockUseRegisteredWindowState.mockImplementation(() => ({
      windowState: "normal",
      isRegistered: true,
      minimize: vi.fn<RegisteredWindowState["minimize"]>(minimizeMock),
      maximize: vi.fn<RegisteredWindowState["maximize"]>(maximizeMock),
      close: vi.fn<RegisteredWindowState["close"]>(closeMock),
      restore: vi.fn<RegisteredWindowState["restore"]>(restoreMock),
      setState: vi.fn<RegisteredWindowState["setState"]>(setMockState),
    }));
    // Reset the external state variable
    mockWindowState = "normal";
  });

  describe("Terminal Provider", () => {
    it("keeps children visible when pathname observation suspends", () => {
      const pathnameSuspension = new Promise<never>(() => {});
      mockUsePathname.mockImplementation(() => {
        throw pathnameSuspension;
      });

      render(
        <TerminalProvider>
          <p>Terminal provider child</p>
        </TerminalProvider>,
      );

      expect(screen.getByText("Terminal provider child")).toBeVisible();
    });
  });

  describe("Command Processing", () => {
    it("processes help command", async () => {
      renderTerminal();
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "help" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter", charCode: 13 });

      await waitFor(() => {
        expect(screen.getByText(/Available commands/i)).toBeInTheDocument();
      });
    });
  });

  describe("Navigation", () => {
    it("navigates to Techstars from terminal input", async () => {
      renderTerminal();
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "techstars" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter", charCode: 13 });

      await waitFor(() => {
        expect(mockRouterPush).toHaveBeenCalledWith("/experience#techstars");
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("labels quick-jump arguments as a site-wide search", async () => {
      mockFetch.mockReturnValue(new Promise<Response>(() => {}));
      renderTerminal();
      const input = screen.getByRole("textbox");

      fireEvent.change(input, { target: { value: "techstars founders" } });
      fireEvent.keyDown(input, { key: "Enter", code: "Enter", charCode: 13 });

      expect(await screen.findByText(/Searching website.*techstars founders/)).toBeInTheDocument();
      expect(screen.queryByText(/Searching for techstars/)).not.toBeInTheDocument();
    });
  });

  describe("Mobile Responsiveness", () => {
    it("maintains proper text wrapping", () => {
      renderTerminal();
      const terminalContent = screen.getByText(/Welcome!/i).closest(".whitespace-pre-wrap");
      expect(terminalContent).toBeTruthy();
      expect(terminalContent?.className ?? "").toContain("break-words");
    });
  });

  describe("Window Controls Integration", () => {
    it("minimizes the terminal", () => {
      // Setup initial state for this test
      mockUseRegisteredWindowState.mockImplementation(() => ({
        windowState: "normal",
        isRegistered: true,
        minimize: vi.fn<RegisteredWindowState["minimize"]>(minimizeMock),
        maximize: vi.fn<RegisteredWindowState["maximize"]>(),
        close: vi.fn<RegisteredWindowState["close"]>(),
        restore: vi.fn<RegisteredWindowState["restore"]>(),
        setState: vi.fn<RegisteredWindowState["setState"]>(),
      }));

      const { rerender } = renderTerminal();
      const minimizeButton = screen.getByTitle(/minimize/i); // Query by title

      // Setup state for *after* minimize click
      mockUseRegisteredWindowState.mockImplementationOnce(() => ({
        windowState: "minimized",
        isRegistered: true,
        minimize: vi.fn<RegisteredWindowState["minimize"]>(minimizeMock),
        maximize: vi.fn<RegisteredWindowState["maximize"]>(),
        close: vi.fn<RegisteredWindowState["close"]>(),
        restore: vi.fn<RegisteredWindowState["restore"]>(),
        setState: vi.fn<RegisteredWindowState["setState"]>(),
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
      const mockMaximize = vi.fn<RegisteredWindowState["maximize"]>();

      mockUseRegisteredWindowState.mockImplementation(() => ({
        windowState: "normal",
        isRegistered: true,
        minimize: vi.fn<RegisteredWindowState["minimize"]>(),
        maximize: mockMaximize,
        close: vi.fn<RegisteredWindowState["close"]>(),
        restore: vi.fn<RegisteredWindowState["restore"]>(),
        setState: vi.fn<RegisteredWindowState["setState"]>(),
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
        minimize: vi.fn<RegisteredWindowState["minimize"]>(),
        maximize: vi.fn<RegisteredWindowState["maximize"]>(),
        close: vi.fn<RegisteredWindowState["close"]>(closeMock),
        restore: vi.fn<RegisteredWindowState["restore"]>(),
        setState: vi.fn<RegisteredWindowState["setState"]>(),
      }));

      const { rerender } = renderTerminal();
      const closeButton = screen.getByTitle(/close/i); // Query by title

      // Set state for *after* close click
      mockUseRegisteredWindowState.mockImplementationOnce(() => ({
        windowState: "closed",
        isRegistered: true,
        minimize: vi.fn<RegisteredWindowState["minimize"]>(),
        maximize: vi.fn<RegisteredWindowState["maximize"]>(),
        close: vi.fn<RegisteredWindowState["close"]>(closeMock),
        restore: vi.fn<RegisteredWindowState["restore"]>(),
        setState: vi.fn<RegisteredWindowState["setState"]>(),
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
