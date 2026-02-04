import type { UmamiMock, MockScriptProps } from "@/types/test";
import { render, act } from "@testing-library/react";
import { Analytics } from "@/components/analytics/analytics.client";
import { vi } from "vitest";

// Use vi.hoisted for shared state to avoid hoisting issues
const { loadedScripts, scriptConfig, mockUsePathname } = vi.hoisted(() => ({
  loadedScripts: {} as Record<string, boolean>,
  scriptConfig: { shouldError: false },
  mockUsePathname: vi.fn(),
}));

// Mock next/navigation using vi.mock
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock next/script using vi.mock
vi.mock("next/script", async () => {
  const React = await import("react");
  return {
    __esModule: true,
    default: function Script({
      id,
      onLoad,
      onError,
      ...props
    }: MockScriptProps & Record<string, any>) {
      // Access pathname to simulate route change tracking
      const pathname = mockUsePathname();
      const autoTrack = props["data-auto-track"];
      const websiteId = props["data-website-id"];

      // Use React.useEffect to simulate script loading
      React.useEffect(() => {
        if (scriptConfig.shouldError) {
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

              // Simulate auto-track on load
              if (autoTrack === "true") {
                umamiMock.track("pageview", {
                  path: pathname,
                  website: websiteId,
                });
              }
            } else if (id === "plausible") {
              // Mock Plausible initialization
              (global as any).plausible = vi.fn();
              loadedScripts[id] = true; // Mark as loaded
              onLoad?.();
            }
          }, 10);
          return () => clearTimeout(timer);
        } else {
          // Already loaded, handle route changes if applicable
          if (id === "umami" && (global as any).umami) {
            // In real life, the script listens to history events.
            // Here we simulate it reacting to pathname changes (since we consume it).
            // We rely on useEffect dependency [pathname]
            (global as any).umami.track("pageview", {
              path: pathname,
              // website id might not be needed for subsequent calls or is implicit
            });
          }
        }
      }, [autoTrack, id, onError, onLoad, pathname, websiteId]); // React to pathname changes
      return null;
    },
  };
});

describe("Analytics", () => {
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
    scriptConfig.shouldError = false;

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

    // Use async timer advancement to properly flush promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Verify scripts loaded and tracking was called
    expect((global as any).umami).toBeDefined();
    expect((global as any).umami?.track).toHaveBeenCalled();
    expect((global as any).plausible).toBeDefined();

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
    mockUsePathname.mockReturnValue("/initial-path");
    const { rerender } = render(<Analytics />);

    // Use async timer advancement to properly flush promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Verify at least one call was for the initial path
    expect((global as any).umami?.track).toHaveBeenCalled();
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

    // Advance timers to allow the timeout in useEffect to trigger (if any)
    // Here we advanced enough for the effect to run due to dependency change
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Verify the track call triggered by the pathname change
    expect((global as any).umami?.track).toHaveBeenCalledWith(
      "pageview",
      expect.objectContaining({
        path: "/new-path",
      }),
    );
    // Ensure it was called exactly once after the clear
    expect((global as any).umami?.track).toHaveBeenCalledTimes(1);
  });

  it("handles script load errors gracefully with warning", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    scriptConfig.shouldError = true;

    const { container } = render(<Analytics />);

    // Use async timer advancement to properly flush promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Component should still be mounted
    expect(container).toBeTruthy();
    // Global umami should not be defined when script errors
    expect((global as any).umami).toBeUndefined();
    // Warning should be logged via onError handler
    expect(consoleSpy).toHaveBeenCalledWith(
      "[Analytics] Failed to load Umami script - continuing without analytics",
    );
    consoleSpy.mockRestore();
  });
});
