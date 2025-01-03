import { render, screen, fireEvent, within } from '@testing-library/react';
import { Navigation } from '../../../../components/ui/navigation/navigation';
import { usePathname } from 'next/navigation';
import { navigationLinks } from '../../../../components/ui/navigation/navigation-links';
import { useTerminalContext } from '../../../../components/ui/terminal/terminal-context';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn()
}));

// Mock terminal context
jest.mock('../../../../components/ui/terminal/terminal-context', () => ({
  useTerminalContext: jest.fn()
}));

// Mock window-controls component
jest.mock('../../../../components/ui/navigation/window-controls', () => ({
  WindowControls: () => <div data-testid="window-controls">Window Controls</div>
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, ...props }: any) => {
    return <a {...props}>{children}</a>;
  };
});

describe('Navigation', () => {
  const mockClearHistory = jest.fn();

  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
    (useTerminalContext as jest.Mock).mockReturnValue({
      clearHistory: mockClearHistory
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Desktop View', () => {
    beforeEach(() => {
      // Set viewport to desktop size
      global.innerWidth = 1024;
      global.dispatchEvent(new Event('resize'));
    });

    it('renders all navigation links', () => {
      render(<Navigation />);

      navigationLinks.forEach(link => {
        expect(screen.getByRole('link', { name: link.name })).toBeInTheDocument();
      });
    });

    it('highlights current path', () => {
      (usePathname as jest.Mock).mockReturnValue('/blog');
      render(<Navigation />);

      const blogLink = screen.getByRole('link', { name: 'Blog' });
      expect(blogLink).toHaveAttribute('aria-current', 'page');
    });

    it('renders window controls in both views', () => {
      render(<Navigation />);
      const nav = screen.getByRole('navigation');

      // Check desktop view
      const desktopView = nav.querySelector('.sm\\:flex');
      expect(desktopView).toBeInTheDocument();
      const desktopControls = within(desktopView as HTMLElement).getAllByTestId('window-controls');
      expect(desktopControls).toHaveLength(1);

      // Check mobile view
      const mobileView = nav.querySelector('.sm\\:hidden');
      expect(mobileView).toBeInTheDocument();
      const mobileControls = within(mobileView as HTMLElement).getAllByTestId('window-controls');
      expect(mobileControls).toHaveLength(1);
    });
  });

  describe('Mobile View', () => {
    beforeEach(() => {
      // Set viewport to mobile size
      global.innerWidth = 375;
      global.dispatchEvent(new Event('resize'));
    });

    it('shows menu button on mobile', () => {
      render(<Navigation />);
      expect(screen.getByRole('button', { name: 'Toggle menu' })).toBeInTheDocument();
    });

    it('toggles menu visibility when button is clicked', () => {
      render(<Navigation />);

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
      render(<Navigation />);

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
      render(<Navigation />);

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
      render(<Navigation />);
      const button = screen.getByRole('button', { name: 'Toggle menu' });
      expect(button).toHaveAttribute('aria-label', 'Toggle menu');
    });

    it('marks current page link with aria-current', () => {
      (usePathname as jest.Mock).mockReturnValue('/blog');
      render(<Navigation />);

      const currentLink = screen.getByRole('link', { name: 'Blog' });
      expect(currentLink).toHaveAttribute('aria-current', 'page');

      const otherLink = screen.getByRole('link', { name: 'Home' });
      expect(otherLink).not.toHaveAttribute('aria-current');
    });
  });

  describe('Terminal Integration', () => {
    it('clears terminal history when link is clicked', () => {
      render(<Navigation />);

      // Click any navigation link
      fireEvent.click(screen.getByRole('link', { name: 'Blog' }));

      expect(mockClearHistory).toHaveBeenCalled();
    });
  });
});
