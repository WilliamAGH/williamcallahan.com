/**
 * Tests for Plausible Analytics frozen array handling
 * Ensures the script handles iOS Safari 14.4 frozen array issues gracefully
 */

describe("Plausible Analytics Frozen Array Handling", () => {
  beforeEach(() => {
    // Reset window.plausible before each test
    delete (global as any).window.plausible;

    // Mock window object
    (global as any).window = {};
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper function to simulate the plausible script behavior
  const initPlausible = () => {
    (global as any).window.plausible =
      (global as any).window.plausible ||
      ((...args: any[]) => {
        // Initialize queue if it doesn't exist
        if (!(global as any).window.plausible.q) {
          (global as any).window.plausible.q = [];
        }

        // Defensive push - handle frozen or read-only arrays
        // This fixes iOS Safari 14.4 compatibility where arrays may be frozen
        try {
          (global as any).window.plausible.q.push(args);
        } catch {
          // If push fails (frozen array), create a new array with existing items plus new one
          // Use concat for better iOS Safari compatibility
          if (Array.isArray((global as any).window.plausible.q)) {
            (global as any).window.plausible.q = (global as any).window.plausible.q.concat([args]);
          } else {
            // Fallback: reinitialize if something went very wrong
            (global as any).window.plausible.q = [args];
          }
        }
      });
  };

  it("should handle normal array push operations", () => {
    initPlausible();

    // Test normal push
    (global as any).window.plausible("pageview");
    expect((global as any).window.plausible.q).toHaveLength(1);
    expect((global as any).window.plausible.q[0]).toEqual(["pageview"]);

    // Add another event
    (global as any).window.plausible("custom", { prop: "value" });
    expect((global as any).window.plausible.q).toHaveLength(2);
    expect((global as any).window.plausible.q[1]).toEqual(["custom", { prop: "value" }]);
  });

  it("should handle frozen arrays gracefully", () => {
    initPlausible();

    // First event works normally
    (global as any).window.plausible("pageview");
    expect((global as any).window.plausible.q).toHaveLength(1);

    // Freeze the array to simulate iOS Safari 14.4 behavior
    Object.freeze((global as any).window.plausible.q);

    // This should not throw and should create a new array
    expect(() => {
      (global as any).window.plausible("custom", { frozen: true });
    }).not.toThrow();

    // Should have created a new array with both events
    expect((global as any).window.plausible.q).toHaveLength(2);
    expect((global as any).window.plausible.q[0]).toEqual(["pageview"]);
    expect((global as any).window.plausible.q[1]).toEqual(["custom", { frozen: true }]);
  });

  it("should handle read-only array property", () => {
    initPlausible();

    // Create a read-only array by defining a non-writable property
    Object.defineProperty((global as any).window.plausible, "q", {
      value: [],
      writable: true,
      configurable: true,
    });

    // Add an event
    (global as any).window.plausible("pageview");

    // Make the array read-only
    const frozenArray = (global as any).window.plausible.q;
    Object.freeze(frozenArray);
    Object.defineProperty((global as any).window.plausible, "q", {
      value: frozenArray,
      writable: true, // Still writable so we can replace the whole array
      configurable: true,
    });

    // This should work by replacing the entire array
    expect(() => {
      (global as any).window.plausible("readonly-test");
    }).not.toThrow();

    expect((global as any).window.plausible.q).toHaveLength(2);
  });

  it("should handle corrupted queue gracefully", () => {
    initPlausible();

    // Corrupt the queue
    (global as any).window.plausible.q = "not-an-array";

    // Should reinitialize with the new event
    expect(() => {
      (global as any).window.plausible("recovery-test");
    }).not.toThrow();

    expect(Array.isArray((global as any).window.plausible.q)).toBe(true);
    expect((global as any).window.plausible.q).toHaveLength(1);
    expect((global as any).window.plausible.q[0]).toEqual(["recovery-test"]);
  });
});
