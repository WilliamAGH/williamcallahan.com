import { jest, describe, beforeEach, it, expect } from "@jest/globals";
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Navigation } from "@/components/ui/navigation/navigation.client";
import { TerminalProvider } from "@/components/ui/terminal/terminal-context.client";
// Import the REAL provider is already imported above

// Create mock functions
const mockUseWindowSize = jest.fn();
const mockUsePathname = jest.fn();

// Mock the useWindowSize hook using mock.module
// Use relative path for Jest compatibility
// import { useWindowSize } from '../../../../lib/hooks/use-window-size.client'; // Remove original import
jest.mock("@/lib/hooks/use-window-size.client", () => ({
  useWindowSize: () => mockUseWindowSize(),
}));

// Mock next/navigation using jest.mock
jest.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// REMOVE ALL MOCKING FOR terminal-context.client

// Mock window-controls component using jest.mock
jest.mock("@/components/ui/navigation/window-controls", () => {
  function MockWindowControls() {
    return <div data-testid="window-controls">Window Controls</div>;
  }
  MockWindowControls.displayName = "MockWindowControls";
  return { WindowControls: MockWindowControls }; // Return the component directly
});

// Mock next/link using jest.mock
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, prefetch, scroll, ...props }: any) => {
    // Import React properly at the top instead of requiring it
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

// Import mocks *after* setting them up
import { useWindowSize as useWindowSizeImported } from "@/lib/hooks/use-window-size.client";
import { usePathname as usePathnameImported } from "next/navigation";
import { navigationLinks } from "@/components/ui/navigation/navigation-links";

describe("Navigation", () => {
  // Store original window values
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    mockUsePathname.mockReturnValue("/"); // Use mock handle
    // Reset any other necessary mocks
    mockUseWindowSize.mockClear(); // Clear window size mock
    mockUseWindowSize.mockReturnValue({ width: 1280, height: 800 }); // Set default desktop size
    mockUsePathname.mockClear(); // Clear pathname mock

    // Mock window dimensions to match our hook mock
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    // Restore original window values
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: originalInnerHeight,
    });
  });

  // afterEach likely not needed for context mocks anymore

  describe("Desktop View", () => {
    beforeEach(() => {
      // Set viewport to desktop size via the mock handle
      mockUseWindowSize.mockReturnValue({ width: 1280, height: 800 });
    });

    it("renders all navigation links", () => {
      // Set to XL size (1440px) to ensure Contact link is visible (XL breakpoint is 1280px)
      mockUseWindowSize.mockReturnValue({ width: 1440, height: 800 });
      // Also mock the window dimensions to match
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 1440,
      });
      Object.defineProperty(window, "innerHeight", {
        writable: true,
        configurable: true,
        value: 800,
      });
      // Wrap with Provider
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );

      // Debug: check which links are actually rendered
      const allLinks = screen.getAllByRole("link");
      console.log(
        "Rendered links:",
        allLinks.map((link) => link.textContent),
      );
      console.log(
        "Expected navigationLinks:",
        navigationLinks.map((link) => link.name),
      );

      // At 1440px width, all links including Contact should be visible
      for (const link of navigationLinks) {
        expect(screen.getByRole("link", { name: link.name })).toBeInTheDocument();
      }
    });

    it("highlights current path", () => {
      mockUsePathname.mockReturnValue("/blog");
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );
      const blogLink = screen.getByRole("link", { name: "Blog" });
      expect(blogLink).toHaveAttribute("aria-current", "page");
    });

    it("renders navigation views without window controls", () => {
      // Wrap with Provider
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );
      const nav = screen.getByRole("navigation");

      // Check desktop view
      const desktopView = nav.querySelector(".sm\\:flex");
      expect(desktopView).toBeInTheDocument();
      expect(
        within(desktopView as HTMLElement).queryByTestId("window-controls"),
      ).not.toBeInTheDocument();

      // Check mobile view
      const mobileView = nav.querySelector(".sm\\:hidden");
      expect(mobileView).toBeInTheDocument();
      expect(
        within(mobileView as HTMLElement).queryByTestId("window-controls"),
      ).not.toBeInTheDocument();
    });
  });

  describe("Mobile View", () => {
    beforeEach(() => {
      // Set viewport to mobile size via the mock handle
      mockUseWindowSize.mockReturnValue({ width: 500, height: 600 });
    });

    it("shows menu button on mobile", () => {
      // Wrap with Provider
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );
      expect(screen.getByRole("button", { name: "Toggle menu" })).toBeInTheDocument();
    });

    it("toggles menu visibility when button is clicked", () => {
      // Wrap with Provider
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );

      const nav = screen.getByRole("navigation");

      // Initially menu should be hidden
      expect(nav.querySelector('[data-testid="mobile-menu"]')).not.toBeInTheDocument();

      // Click menu button
      fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));

      // Menu should be visible
      const mobileMenu = nav.querySelector('[data-testid="mobile-menu"]') as HTMLElement;
      expect(mobileMenu).toBeInTheDocument();

      // Check all links are present
      for (const link of navigationLinks) {
        expect(within(mobileMenu).getByRole("link", { name: link.name })).toBeInTheDocument();
      }
    });

    it("closes menu when a link is clicked", () => {
      // Wrap with Provider
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );

      const nav = screen.getByRole("navigation");

      // Open menu
      fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));

      // Get mobile menu and click a link
      const mobileMenu = nav.querySelector('[data-testid="mobile-menu"]') as HTMLElement;
      const blogLink = within(mobileMenu).getByRole("link", { name: "Blog" });
      fireEvent.click(blogLink);

      // Menu should be closed
      expect(nav.querySelector('[data-testid="mobile-menu"]')).not.toBeInTheDocument();
    });

    it("shows correct icon based on menu state", () => {
      // Wrap with Provider
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );

      const button = screen.getByRole("button", { name: "Toggle menu" });

      // Initially shows menu icon
      const menuIcon = button.querySelector(".lucide-menu");
      expect(menuIcon).toBeInTheDocument();
      expect(menuIcon?.tagName.toLowerCase()).toBe("svg");

      // Click to open
      fireEvent.click(button);

      // Should show close icon
      const closeIcon = button.querySelector(".lucide-x");
      expect(closeIcon).toBeInTheDocument();
      expect(closeIcon?.tagName.toLowerCase()).toBe("svg");
    });
  });

  describe("Accessibility", () => {
    it("has accessible button for menu toggle", () => {
      // Wrap with Provider
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );
      const button = screen.getByRole("button", { name: "Toggle menu" });
      expect(button).toHaveAttribute("aria-label", "Toggle menu");
    });

    it("marks current page link with aria-current attribute", () => {
      mockUsePathname.mockReturnValue("/blog");
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );
      const currentLink = screen.getByRole("link", { name: "Blog" });
      expect(currentLink).toHaveAttribute("aria-current", "page");
      const otherLink = screen.getByRole("link", { name: "Home" });
      expect(otherLink).not.toHaveAttribute("aria-current");
    });
  });

  describe("Terminal Integration", () => {
    it("does not crash when a link is clicked (implicitly calls clearHistory)", () => {
      // Wrap with Provider
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );

      // Click any navigation link
      const blogLink = screen.getByRole("link", { name: "Blog" });
      // Expecting the click not to throw an error when clearHistory is called internally
      expect(() => fireEvent.click(blogLink)).not.toThrow();
    });
  });
});
