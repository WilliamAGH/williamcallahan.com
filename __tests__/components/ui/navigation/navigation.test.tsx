import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Navigation } from '../../../../components/ui/navigation/navigation.client';
import { usePathname } from 'next/navigation';
import { navigationLinks } from '../../../../components/ui/navigation/navigation-links';
// Import the REAL provider
import { TerminalProvider } from '../../../../components/ui/terminal/terminal-context.client';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn()
}));

// REMOVE ALL MOCKING FOR terminal-context.client

// Mock window-controls component
jest.mock('../../../../components/ui/navigation/window-controls', () => {
  function MockWindowControls() {
    return <div data-testid="window-controls">Window Controls</div>;
  }
  MockWindowControls.displayName = 'MockWindowControls';
  return { WindowControls: MockWindowControls };
});

// Mock next/link
jest.mock('next/link', () => {
  function MockLink({ children, href, prefetch, ...props }: any) {
    // Filter out Next.js specific props and only pass HTML-valid ones to <a>
    return <a href={href} {...props}>{children}</a>;
  }
  MockLink.displayName = 'MockLink';
  return MockLink;
});

// Mock window-controls component (keep this)
jest.mock('../../../../components/ui/navigation/window-controls', () => {
  function MockWindowControls() {
    return <div data-testid="window-controls">Window Controls</div>;
  }
  MockWindowControls.displayName = 'MockWindowControls';
  return { WindowControls: MockWindowControls };
});

// Mock next/link (keep this)
jest.mock('next/link', () => {
  function MockLink({ children, href, prefetch, ...props }: any) {
    // Filter out Next.js specific props and only pass HTML-valid ones to <a>
    return <a href={href} {...props}>{children}</a>;
  }
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('Navigation', () => {
  // Remove context mock setup
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
    // Reset any other necessary mocks
    jest.clearAllMocks();
  });

  // afterEach likely not needed for context mocks anymore

  describe('Desktop View', () => {
    beforeEach(() => {
      // Set viewport to desktop size
      global.innerWidth = 1024;
      global.dispatchEvent(new Event('resize'));
    });

    it('renders all navigation links', () => {
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);

      navigationLinks.forEach(link => {
        expect(screen.getByRole('link', { name: link.name })).toBeInTheDocument();
      });
    });

    it('highlights current path', () => {
      (usePathname as jest.Mock).mockReturnValue('/blog');
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);

      const blogLink = screen.getByRole('link', { name: 'Blog' });
      expect(blogLink).toHaveAttribute('aria-current', 'page');
    });

    it('renders navigation views without window controls', () => {
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);
      const nav = screen.getByRole('navigation');

      // Check desktop view
      const desktopView = nav.querySelector('.sm\\:block');
      expect(desktopView).toBeInTheDocument();
      expect(within(desktopView as HTMLElement).queryByTestId('window-controls')).not.toBeInTheDocument();

      // Check mobile view
      const mobileView = nav.querySelector('.sm\\:hidden');
      expect(mobileView).toBeInTheDocument();
      expect(within(mobileView as HTMLElement).queryByTestId('window-controls')).not.toBeInTheDocument();
    });
  });

  describe('Mobile View', () => {
    beforeEach(() => {
      // Set viewport to mobile size
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));
    });

    it('shows menu button on mobile', () => {
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);
      expect(screen.getByRole('button', { name: 'Toggle menu' })).toBeInTheDocument();
    });

    it('toggles menu visibility when button is clicked', () => {
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);

      const nav = screen.getByRole('navigation');

      // Initially menu should be hidden
      expect(nav.querySelector('[data-testid="mobile-menu"]')).not.toBeInTheDocument();

      // Click menu button
      fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));

      // Menu should be visible
      const mobileMenu = nav.querySelector('[data-testid="mobile-menu"]') as HTMLElement;
      expect(mobileMenu).toBeInTheDocument();

      // Check all links are present
      navigationLinks.forEach(link => {
        expect(within(mobileMenu).getByRole('link', { name: link.name })).toBeInTheDocument();
      });
    });

    it('closes menu when a link is clicked', () => {
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);

      const nav = screen.getByRole('navigation');

      // Open menu
      fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));

      // Get mobile menu and click a link
      const mobileMenu = nav.querySelector('[data-testid="mobile-menu"]') as HTMLElement;
      const blogLink = within(mobileMenu).getByRole('link', { name: 'Blog' });
      fireEvent.click(blogLink);

      // Menu should be closed
      expect(nav.querySelector('[data-testid="mobile-menu"]')).not.toBeInTheDocument();
    });

    it('shows correct icon based on menu state', () => {
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);

      const button = screen.getByRole('button', { name: 'Toggle menu' });

      // Initially shows menu icon
      const menuIcon = button.querySelector('.lucide-menu');
      expect(menuIcon).toBeInTheDocument();
      expect(menuIcon?.tagName.toLowerCase()).toBe('svg');

      // Click to open
      fireEvent.click(button);

      // Should show close icon
      const closeIcon = button.querySelector('.lucide-x');
      expect(closeIcon).toBeInTheDocument();
      expect(closeIcon?.tagName.toLowerCase()).toBe('svg');
    });
  });

  describe('Accessibility', () => {
    it('has accessible button for menu toggle', () => {
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);
      const button = screen.getByRole('button', { name: 'Toggle menu' });
      expect(button).toHaveAttribute('aria-label', 'Toggle menu');
    });

    it('marks current page link with aria-current', () => {
      (usePathname as jest.Mock).mockReturnValue('/blog');
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);

      const currentLink = screen.getByRole('link', { name: 'Blog' });
      expect(currentLink).toHaveAttribute('aria-current', 'page');

      const otherLink = screen.getByRole('link', { name: 'Home' });
      expect(otherLink).not.toHaveAttribute('aria-current');
    });
  });

  describe('Terminal Integration', () => {
    it('does not crash when a link is clicked (implicitly calls clearHistory)', () => {
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);

      // Click any navigation link
      const blogLink = screen.getByRole('link', { name: 'Blog' });
      // Expecting the click not to throw an error when clearHistory is called internally
      expect(() => fireEvent.click(blogLink)).not.toThrow();
    });
  });
});
