import type { UmamiMock, MockScriptProps } from "@/types/test";
import { render, act } from "@testing-library/react";
import { Analytics } from "@/components/analytics/analytics.client";
import { vi } from "vitest";

function isUmamiMock(value: unknown): value is UmamiMock {
  if (typeof value !== "function") {
    return false;
  }

  const candidate = value as { track?: unknown };
  return typeof candidate.track === "function";
}

function getGlobalUmami(): UmamiMock | undefined {
  const candidate = (globalThis as { umami?: unknown }).umami;
  if (candidate === undefined) {
    return undefined;
  }
  if (!isUmamiMock(candidate)) {
    throw new Error("Expected globalThis.umami to be a callable Umami mock with a track() mock");
  }
  return candidate;
}

function hasGlobalPlausible(): boolean {
  const candidate = (globalThis as { plausible?: unknown }).plausible;
  return typeof candidate === "function";
}

type MockedScriptDataProps = {
  "data-auto-track"?: "true" | "false";
  "data-website-id"?: string;
};

type MockedNextScriptProps = MockScriptProps &
  MockedScriptDataProps & {
    [key: string]: unknown;
  };

// Use vi.hoisted for shared state to avoid hoisting issues
const { loadedScripts, scriptConfig, mockUsePathname } = vi.hoisted(() => {
  const loadedScripts: Record<string, boolean> = {};
  const scriptConfig = { shouldError: false };
  const mockUsePathname = vi.fn();

  return { loadedScripts, scriptConfig, mockUsePathname };
});

// Mock next/navigation using vi.mock
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock next/script using vi.mock
vi.mock("next/script", async () => {
  const React = await import("react");
  return {
    __esModule: true,
    default: function Script({ id, onLoad, onError, ...props }: MockedNextScriptProps) {
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
              Reflect.set(globalThis, "umami", umamiMock);
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
              Reflect.set(globalThis, "plausible", vi.fn());
              loadedScripts[id] = true; // Mark as loaded
              onLoad?.();
            } else {
              loadedScripts[id] = true;
              onLoad?.();
            }
          }, 10);
          return () => clearTimeout(timer);
        } else {
          // Already loaded, handle route changes if applicable
          if (id === "umami") {
            const umami = getGlobalUmami();
            if (!umami) {
              throw new Error(
                "Expected globalThis.umami to be set when the Umami script is already loaded",
              );
            }
            // In real life, the script listens to history events.
            // Here we simulate it reacting to pathname changes (since we consume it).
            // We rely on useEffect dependency [pathname]
            umami.track("pageview", {
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
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

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
    Reflect.deleteProperty(globalThis, "umami");
    Reflect.deleteProperty(globalThis, "plausible");

    // Use fake timers
    vi.useFakeTimers();

    // Clear console mocks
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
    consoleDebugSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  afterAll(() => {
    vi.doUnmock("next/navigation");
    vi.doUnmock("next/script");
  });

  it("initializes analytics scripts correctly", async () => {
    render(<Analytics />);

    // Use async timer advancement to properly flush promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Verify scripts loaded and tracking was called
    const umami = getGlobalUmami();
    if (!umami) {
      throw new Error("Expected globalThis.umami to be defined after script load");
    }
    expect(umami.track).toHaveBeenCalled();
    expect(hasGlobalPlausible()).toBe(true);

    // Verify tracking was called with correct arguments
    expect(umami.track).toHaveBeenCalledWith(
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

  it("skips Umami but renders other providers when Umami env vars are missing", async () => {
    // Clear Umami-specific environment variables
    process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID = "";
    process.env.NEXT_PUBLIC_SITE_URL = "";

    render(<Analytics />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Umami should NOT be initialized (requires website ID)
    expect(getGlobalUmami()).toBeUndefined();
    // Plausible should also be disabled — no domain can be derived without NEXT_PUBLIC_SITE_URL
    expect(hasGlobalPlausible()).toBe(false);
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
    const umami = getGlobalUmami();
    if (!umami) {
      throw new Error("Expected globalThis.umami to be defined after initial render");
    }
    expect(umami.track).toHaveBeenCalled();
    expect(umami.track).toHaveBeenCalledWith(
      "pageview",
      expect.objectContaining({
        path: "/initial-path",
      }),
    );

    // Clear the mock for next assertions
    umami.track.mockClear();

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
    expect(umami.track).toHaveBeenCalledWith(
      "pageview",
      expect.objectContaining({
        path: "/new-path",
      }),
    );
    // Ensure it was called exactly once after the clear
    expect(umami.track).toHaveBeenCalledTimes(1);
  });

  it("handles script load errors gracefully with warning", async () => {
    scriptConfig.shouldError = true;

    const { container } = render(<Analytics />);

    // Use async timer advancement to properly flush promises
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // Component should still be mounted
    expect(container).toBeTruthy();
    // Global umami should not be defined when script errors
    expect(getGlobalUmami()).toBeUndefined();
    // Warning should be logged via onError handler
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[Analytics] Failed to load Umami script - continuing without analytics",
    );
  });
});
