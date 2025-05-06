import { mock, jest, describe, beforeEach, it, expect } from 'bun:test';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Navigation } from '../../../../components/ui/navigation/navigation.client';
import { usePathname } from 'next/navigation';
import { navigationLinks } from '../../../../components/ui/navigation/navigation-links';
// Import the REAL provider
import { TerminalProvider } from '../../../../components/ui/terminal/terminal-context.client';

// Mock the useWindowSize hook using mock.module
// Use relative path for Jest compatibility
// import { useWindowSize } from '../../../../lib/hooks/use-window-size.client'; // Remove original import
mock.module('../../../../lib/hooks/use-window-size.client', () => ({ // Use mock.module
  useWindowSize: jest.fn(() => ({ width: 1280, height: 800 })) // Keep jest.fn, provide default
}));

// Mock next/navigation using mock.module
mock.module('next/navigation', () => ({ // Use mock.module
  usePathname: jest.fn(() => '/') // Keep jest.fn, provide default
}));

// REMOVE ALL MOCKING FOR terminal-context.client

// Mock window-controls component using mock.module
mock.module('../../../../components/ui/navigation/window-controls', () => { // Use mock.module
  function MockWindowControls() {
    return <div data-testid="window-controls">Window Controls</div>;
  }
  MockWindowControls.displayName = 'MockWindowControls';
  return { WindowControls: MockWindowControls }; // Return the component directly
});

// Mock next/link using mock.module
mock.module('next/link', () => { // Use mock.module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function MockLink({ children, href, scroll, ...props }: any) { // Destructure and ignore scroll
    // Filter out Next.js specific props and only pass HTML-valid ones to <a>
    return <a href={href} {...props}>{children}</a>;
  }
  MockLink.displayName = 'MockLink';
  return { default: MockLink }; // Export as default
});

// Import mocks *after* setting them up
import { useWindowSize as useWindowSizeImported } from '../../../../lib/hooks/use-window-size.client';
import { usePathname as usePathnameImported } from 'next/navigation';

// Get handles to the mocks
const mockedUseWindowSize = useWindowSizeImported as jest.Mock;
const mockedUsePathname = usePathnameImported as jest.Mock;

describe('Navigation', () => {
  // Removed cast of mockedUseWindowSize here, already done above

  beforeEach(() => {
    mockedUsePathname.mockReturnValue('/'); // Use mock handle
    // Reset any other necessary mocks
    mockedUseWindowSize.mockClear(); // Clear window size mock
    mockedUseWindowSize.mockReturnValue({ width: 1280, height: 800 }); // Set default desktop size
    mockedUsePathname.mockClear(); // Clear pathname mock
  });

  // afterEach likely not needed for context mocks anymore

  describe('Desktop View', () => {
    beforeEach(() => {
      // Set viewport to desktop size via the mock handle
      mockedUseWindowSize.mockReturnValue({ width: 1280, height: 800 });
    });

    it('renders all navigation links', () => {
      // Wrap with Provider
      render(<TerminalProvider><Navigation /></TerminalProvider>);

      navigationLinks.forEach(link => {
        expect(screen.getByRole('link', { name: link.name })).toBeInTheDocument();
      });
    });

    it('highlights current path', () => {
      mockedUsePathname.mockReturnValue('/blog'); // Use mock handle
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
      const desktopView = nav.querySelector('.sm\\:flex');
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
      // Set viewport to mobile size via the mock handle
      mockedUseWindowSize.mockReturnValue({ width: 500, height: 600 });
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
      mockedUsePathname.mockReturnValue('/blog'); // Use mock handle
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
