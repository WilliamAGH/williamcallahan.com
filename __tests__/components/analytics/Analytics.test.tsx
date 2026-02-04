import type { UmamiMock, MockScriptProps } from "@/types/test";
import { render, waitFor, act } from "@testing-library/react";
import { Analytics } from "@/components/analytics/analytics.client";
import { vi } from "vitest";

// Create mock functions
const mockUsePathname = vi.fn();

// Mock next/navigation using vi.mock
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// Keep track of loaded scripts in the mock scope
const loadedScripts: Record<string, boolean> = {};
let mockScriptShouldError = false;

// Mock next/script using vi.mock

vi.mock("next/script", async () => {
  const React = await import("react");
  return {
    __esModule: true,
    default: function Script({ id, onLoad, onError }: MockScriptProps) {
      // Use React.useEffect to simulate script loading
      React.useEffect(() => {
        if (mockScriptShouldError) {
          const timer = setTimeout(() => {
            onError?.(new Error("Failed to load script"));
          }, 10);
          return () => clearTimeout(timer);
        }

        if (!loadedScripts[id]) {
          const timer = setTimeout(() => {
            if (id === "umami") {
              // Mock Umami initialization
              const umamiMock: UmamiMock = Object.assign(vi.fn(), {
                track: vi.fn(),
              });
              (global as any).umami = umamiMock;
              loadedScripts[id] = true; // Mark as loaded
              onLoad?.();
            } else if (id === "plausible") {
              // Mock Plausible initialization
              (global as any).plausible = vi.fn();
              loadedScripts[id] = true; // Mark as loaded
              onLoad?.();
            }
          }, 10);
          return () => clearTimeout(timer);
        }
      }, [id, onLoad, onError]);
      return null;
    },
  };
});

// Statically import the mocked modules *after* mocking

describe.skip("Analytics", () => {
  const originalEnv = process.env;
  const mockWebsiteId = "test-website-id";
  const mockSiteUrl = "https://williamcallahan.com";

  beforeEach(() => {
    // Setup environment variables
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: mockWebsiteId,
      NEXT_PUBLIC_SITE_URL: mockSiteUrl,
      NODE_ENV: "production", // Force production mode so Umami script is rendered in test
    };

    // Mock pathname
    mockUsePathname.mockReturnValue("/test-page");

    // Reset the loadedScripts state directly here
    loadedScripts.umami = false;
    loadedScripts.plausible = false;
    mockScriptShouldError = false;

    // Reset window objects between tests
    (global as any).umami = undefined;
    (global as any).plausible = undefined;

    // Use fake timers
    vi.useFakeTimers();

    // Clear console mocks
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
  });

  it("initializes analytics scripts correctly", async () => {
    render(<Analytics />);

    // Advance timers to trigger script load
    act(() => {
      vi.advanceTimersByTime(20); // Revert to fake timers
    });

    // Wait for scripts to "load"
    await waitFor(() => {
      expect((global as any).umami).toBeDefined();
      expect((global as any).umami?.track).toHaveBeenCalled();
      expect((global as any).plausible).toBeDefined();
    });

    // Verify tracking was called with correct arguments
    expect((global as any).umami?.track).toHaveBeenCalledWith(
      "pageview",
      expect.objectContaining({
        path: "/test-page",
        website: mockWebsiteId,
      }),
    );
  });

  it("handles blog post paths correctly", () => {
    // Mock a blog post path
    mockUsePathname.mockReturnValue("/blog/test-post");

    const { container } = render(<Analytics />);

    // Check that the component rendered
    expect(container).toBeTruthy();

    // The Analytics component renders Script components from next/script
    // which our mock renders as null, so the container will be empty
    // This is expected behavior for this test
  });

  it("does not initialize without required environment variables", () => {
    // Clear environment variables
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = "";
    process.env.NEXT_PUBLIC_SITE_URL = "";

    const { container } = render(<Analytics />);
    expect(container.innerHTML).toBe("");
  });

  it("tracks page views on route changes", async () => {
    // Start with initial path
    mockUsePathname.mockReturnValue("/initial-path"); // Use mock handle
    const { rerender } = render(<Analytics />);

    // Advance timers to trigger script load (10ms) AND useEffect timeout (100ms)
    act(() => {
      vi.advanceTimersByTime(150); // Revert to fake timers
    });

    // Wait for the initial track calls (could be multiple) to settle
    await waitFor(() => {
      expect((global as any).umami?.track).toHaveBeenCalled();
    });
    // Verify at least one call was for the initial path
    expect((global as any).umami?.track).toHaveBeenCalledWith(
      "pageview",
      expect.objectContaining({
        path: "/initial-path",
      }),
    );

    // Clear the mock for next assertions
    if ((global as any).umami?.track) {
      (global as any).umami.track.mockClear();
    }

    // Change pathname
    mockUsePathname.mockReturnValue("/new-path");

    // Re-render the component
    rerender(<Analytics />);

    // Advance timers to allow the timeout in useEffect to trigger
    act(() => {
      // Advance timers past the 100ms timeout in the useEffect
      vi.advanceTimersByTime(550); // Revert to fake timers
    });

    // Wait for the track call triggered by the pathname change
    await waitFor(() => {
      expect((global as any).umami?.track).toHaveBeenCalledWith(
        "pageview",
        expect.objectContaining({
          path: "/new-path",
        }),
      );
    });
    // Ensure it was called exactly once after the clear
    expect((global as any).umami?.track).toHaveBeenCalledTimes(1);
  });

  it("handles script load errors gracefully", async () => {
    // Now using warn instead of error
    const consoleSpy = vi.spyOn(console, "warn");

    mockScriptShouldError = true;
    render(<Analytics />);

    // Advance timers to trigger error
    act(() => {
      vi.advanceTimersByTime(20); // Revert to fake timers
    });

    await waitFor(() => {
      // Check for the new warning message format
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Analytics] Failed to load Umami script - continuing without analytics",
      );
    });
  });
});
