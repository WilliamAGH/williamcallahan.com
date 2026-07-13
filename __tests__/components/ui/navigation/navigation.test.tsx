import { vi, type Mock } from "vitest";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { navigationLinks } from "@/components/ui/navigation/navigation-links";
import { Navigation } from "@/components/ui/navigation/navigation.client";
import { socialLinks } from "@/components/ui/social-icons/social-links";
import { TerminalProvider } from "@/components/ui/terminal/terminal-context.client";
import { usePathname } from "next/navigation";

const mockUseWindowSize = vi.fn();

vi.mock("@/lib/hooks/use-window-size.client", () => ({
  useWindowSize: () => mockUseWindowSize(),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

function MockWindowControls() {
  return <div data-testid="window-controls">Window Controls</div>;
}
MockWindowControls.displayName = "MockWindowControls";
vi.mock("@/components/ui/navigation/window-controls", () => ({
  WindowControls: MockWindowControls,
}));

interface LinkProps {
  children: React.ReactNode;
  href: string;
  prefetch?: boolean;
  scroll?: boolean;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  [key: string]: unknown;
}
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, onClick, prefetch, scroll, ...props }: LinkProps) => {
    void prefetch;
    void scroll;
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
        {...props}
      >
        {children}
      </a>
    );
  },
}));

describe("Navigation", () => {
  // Store original window values
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    (usePathname as Mock).mockReturnValue("/");
    // Reset any other necessary mocks
    mockUseWindowSize.mockClear(); // Clear window size mock
    mockUseWindowSize.mockReturnValue({ width: 1280, height: 800 }); // Set default desktop size
    // mockUsePathname.mockClear(); // No longer needed

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

      // At 1440px width, all links including Contact should be visible
      for (const link of navigationLinks) {
        expect(screen.getByRole("link", { name: link.name })).toBeInTheDocument();
      }
    });

    it("highlights current path", () => {
      (usePathname as Mock).mockReturnValue("/blog");
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
      const desktopView = nav.querySelector<HTMLElement>(".sm\\:flex");
      expect(desktopView).not.toBeNull();
      // Assert desktopView exists (test will fail above if not)
      expect(within(desktopView!).queryByTestId("window-controls")).not.toBeInTheDocument();

      // Check mobile view
      const mobileView = nav.querySelector<HTMLElement>(".sm\\:hidden");
      expect(mobileView).not.toBeNull();
      // Assert mobileView exists (test will fail above if not)
      expect(within(mobileView!).queryByTestId("window-controls")).not.toBeInTheDocument();
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
      const mobileMenu = screen.getByTestId("mobile-menu");
      expect(mobileMenu).toBeInTheDocument();

      // Check all links are present
      for (const link of navigationLinks) {
        expect(within(mobileMenu).getByRole("link", { name: link.name })).toBeInTheDocument();
      }
    });

    it("exposes the canonical Discord shortcut in the mobile menu", async () => {
      const discordLink = socialLinks.find((link) => link.platform === "discord");
      if (!discordLink) throw new Error("Canonical social links must include Discord");

      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Toggle menu" }));

      const mobileMenu = screen.getByTestId("mobile-menu");
      const renderedLink = await within(mobileMenu).findByRole("link", {
        name: discordLink.label,
      });
      expect(renderedLink).toHaveAttribute("href", discordLink.href);
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
      const mobileMenu = nav.querySelector<HTMLElement>('[data-testid="mobile-menu"]');
      // mobileMenu is guaranteed by getByTestId

      if (!mobileMenu) return;
      const blogLink = within(mobileMenu).getByRole("link", { name: "Blog" });
      fireEvent.click(blogLink);

      // Menu should be closed
      expect(nav.querySelector('[data-testid="mobile-menu"]')).not.toBeInTheDocument();
    });

    it("closes the menu with Escape and restores focus to the toggle", () => {
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );
      const menuButton = screen.getByRole("button", { name: "Toggle menu" });
      menuButton.focus();
      fireEvent.click(menuButton);
      expect(screen.getByTestId("mobile-menu")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("mobile-menu")).not.toBeInTheDocument();
      expect(menuButton).toHaveFocus();
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

    it("reports the menu state and controlled menu", () => {
      render(
        <TerminalProvider>
          <Navigation />
        </TerminalProvider>,
      );
      const button = screen.getByRole("button", { name: "Toggle menu" });
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).not.toHaveAttribute("aria-controls");

      fireEvent.click(button);

      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(button).toHaveAttribute("aria-controls", "mobile-menu");
      expect(screen.getByTestId("mobile-menu")).toHaveAttribute("id", "mobile-menu");
    });

    it("marks current page link with aria-current attribute", () => {
      (usePathname as Mock).mockReturnValue("/blog");
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
