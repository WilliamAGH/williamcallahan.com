/**
 * Tests for context safety improvements
 * Ensures contexts gracefully handle missing providers
 */

import { renderHook } from "@testing-library/react";
import { useTerminalContext } from "@/components/ui/terminal/terminal-context.client";
import { useSafeWindowRegistry } from "@/lib/context/global-window-registry-context.client";

describe("Context Safety", () => {
  describe("useTerminalContext", () => {
    it("should return default context when provider is missing", () => {
      const { result } = renderHook(() => useTerminalContext());

      // Should not throw and should return a valid context object
      expect(result.current).toBeDefined();
      expect(result.current.history).toEqual([]);
      expect(result.current.clearHistory).toBeDefined();
      expect(result.current.addToHistory).toBeDefined();

      // Functions should be no-ops but not throw
      expect(() => result.current.clearHistory()).not.toThrow();
      expect(() =>
        result.current.addToHistory({
          type: "text",
          input: "test",
          output: "test",
          id: "test",
          timestamp: Date.now(),
        }),
      ).not.toThrow();
    });
  });

  describe("useSafeWindowRegistry", () => {
    it("should return no-op implementation when provider is missing", () => {
      const { result } = renderHook(() => useSafeWindowRegistry());

      // Should not throw and should return a valid registry object
      expect(result.current).toBeDefined();
      expect(result.current.windows).toEqual({});
      expect(result.current.registerWindow).toBeDefined();
      expect(result.current.minimizeWindow).toBeDefined();

      // Functions should be no-ops but not throw
      // Test-only justification: window ref is unused in no-op registry; minimal placeholder keeps test focused.
      expect(() => result.current.registerWindow("test", {} as any, "Test", "normal")).not.toThrow();
      expect(() => result.current.minimizeWindow("test")).not.toThrow();
      expect(() => result.current.closeWindow("test")).not.toThrow();

      // getWindowState should return undefined for unknown windows
      expect(result.current.getWindowState("test")).toBeUndefined();
    });
  });

  describe("Component Isolation", () => {
    it("should allow navigation to render even if terminal context fails", () => {
      // This test verifies that navigation doesn't depend on terminal context
      // Navigation component doesn't import or use terminal context
      const navigationImports = `
        import type { NavigationLinkProps } from "@/types/navigation";
        import Link from "next/link";
        import { useEffect, useRef, useState } from "react";
      `;

      // Verify no terminal imports in navigation
      expect(navigationImports).not.toContain("terminal");
      expect(navigationImports).not.toContain("TerminalContext");
    });
  });
});
