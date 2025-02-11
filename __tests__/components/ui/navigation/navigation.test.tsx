import { render, screen, fireEvent, within } from '@testing-library/react';
import { Navigation } from '../../../../components/ui/navigation/navigation';
import { usePathname, useRouter } from 'next/navigation';
import { navigationLinks } from '../../../../components/ui/navigation/navigation-links';
import { useTerminalContext } from '../../../../components/ui/terminal/terminal-context';
import { act } from '../../../../lib/test/setup';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn()
}));

// Mock terminal context
jest.mock('../../../../components/ui/terminal/terminal-context', () => ({
  useTerminalContext: jest.fn()
}));

// Mock window-controls component
jest.mock('../../../../components/ui/navigation/window-controls', () => ({
  WindowControls: () => <div role="group" aria-label="window controls">Window Controls</div>
}));

// Mock next/link with proper event handling
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, onClick, ...props }: any) => {
    return (
      <a
        {...props}
        onClick={(e) => {
          e.preventDefault();
          onClick?.(e);
        }}
      >
        {children}
      </a>
    );
  }
}));

describe('Navigation', () => {
  const mockClearHistory = jest.fn().mockImplementation(() => Promise.resolve());
  const mockRouter = { push: jest.fn() };

  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
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
      const desktopControls = within(desktopView as HTMLElement).getByRole('group', { name: /window controls/i });
      expect(desktopControls).toBeInTheDocument();

      // Check mobile view
      const mobileView = nav.querySelector('.sm\\:hidden');
      expect(mobileView).toBeInTheDocument();
      const mobileControls = within(mobileView as HTMLElement).getByRole('group', { name: /window controls/i });
      expect(mobileControls).toBeInTheDocument();
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

    it('toggles menu visibility when button is clicked', async () => {
      render(<Navigation />);

      const nav = screen.getByRole('navigation');

      // Initially menu should be hidden
      expect(nav.querySelector('[data-testid="mobile-menu"]')).not.toBeInTheDocument();

      // Click menu button
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));
        await Promise.resolve();
      });

      // Menu should be visible
      const mobileMenu = nav.querySelector('[data-testid="mobile-menu"]') as HTMLElement;
      expect(mobileMenu).toBeInTheDocument();
      expect(mobileMenu).toHaveClass('translate-y-0');

      // Check all links are present
      navigationLinks.forEach(link => {
        expect(within(mobileMenu).getByRole('link', { name: link.name })).toBeInTheDocument();
      });
    });

    it('closes menu when a link is clicked', async () => {
      render(<Navigation />);

      const nav = screen.getByRole('navigation');

      // Open menu
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Toggle menu' }));
        await Promise.resolve();
      });

      // Get mobile menu and click a link
      const mobileMenu = nav.querySelector('[data-testid="mobile-menu"]') as HTMLElement;
      const blogLink = within(mobileMenu).getByRole('link', { name: 'Blog' });

      // Click link and verify menu is in closing state
      await act(async () => {
        fireEvent.click(blogLink);
        await Promise.resolve();
      });

      expect(mobileMenu).toHaveClass('-translate-y-full');

      // Trigger transition end
      await act(async () => {
        fireEvent.transitionEnd(mobileMenu);
        await Promise.resolve();
      });

      // Menu should be removed from DOM
      expect(nav.querySelector('[data-testid="mobile-menu"]')).not.toBeInTheDocument();
    });

    it('shows correct icon based on menu state', async () => {
      render(<Navigation />);

      const button = screen.getByRole('button', { name: 'Toggle menu' });

      // Initially shows menu icon
      const menuIcon = button.querySelector('.lucide-menu');
      expect(menuIcon).toBeInTheDocument();
      expect(menuIcon?.tagName.toLowerCase()).toBe('svg');

      // Click to open
      await act(async () => {
        fireEvent.click(button);
        await Promise.resolve();
      });

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
    it('completes cleanup before navigation', async () => {
      render(<Navigation />);

      // Click any navigation link
      const link = screen.getByRole('link', { name: 'Blog' });
      await act(async () => {
        fireEvent.click(link);
        await Promise.resolve();
      });

      expect(mockClearHistory).toHaveBeenCalled();
      expect(mockRouter.push).toHaveBeenCalledWith('/blog');

      // Verify order of execution
      const clearHistoryCall = mockClearHistory.mock.invocationCallOrder[0];
      const routerPushCall = mockRouter.push.mock.invocationCallOrder[0];
      expect(clearHistoryCall).toBeLessThan(routerPushCall);
    });
  });
});
