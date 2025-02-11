import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationLink } from '../../../../components/ui/navigation/navigation-link';
import { useTerminalContext } from '../../../../components/ui/terminal/terminal-context';
import { useRouter } from 'next/navigation';
import { act } from '../../../../lib/test/setup';
import type { ReactNode } from 'react';

// Mock the terminal context
jest.mock('../../../../components/ui/terminal/terminal-context', () => ({
  useTerminalContext: jest.fn()
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn()
}));

// Mock next/link with proper event handling
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, onClick, ...props }: {
    children: ReactNode;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    [key: string]: any;
  }) => {
    return (
      <a
        {...props}
        onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
          // Ensure preventDefault is called before the click handler
          e.preventDefault();
          onClick?.(e);
        }}
      >
        {children}
      </a>
    );
  }
}));

describe('NavigationLink', () => {
  const mockClearHistory = jest.fn().mockImplementation(() => Promise.resolve());
  const mockRouter = { push: jest.fn() };
  const consoleError = console.error;

  beforeEach(() => {
    (useTerminalContext as jest.Mock).mockReturnValue({
      clearHistory: mockClearHistory
    });
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    // Suppress JSDOM navigation warnings
    console.error = (...args: any[]) => {
      if (args[0]?.includes?.('Not implemented: navigation')) return;
      consoleError.apply(console, args);
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    console.error = consoleError;
  });

  it('renders link with correct text and href', () => {
    render(
      <NavigationLink
        path="/test"
        name="Test Link"
        currentPath="/other"
      />
    );

    const link = screen.getByRole('link', { name: 'Test Link' });
    expect(link).toHaveAttribute('href', '/test');
  });

  it('applies active styles when current path matches', () => {
    render(
      <NavigationLink
        path="/test"
        name="Test Link"
        currentPath="/test"
      />
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link).toHaveClass('bg-white');
  });

  it('applies inactive styles when current path does not match', () => {
    render(
      <NavigationLink
        path="/test"
        name="Test Link"
        currentPath="/other"
      />
    );

    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('aria-current');
    expect(link).not.toHaveClass('bg-white');
  });

  it('applies custom className when provided', () => {
    render(
      <NavigationLink
        path="/test"
        name="Test Link"
        currentPath="/other"
        className="custom-class"
      />
    );

    const link = screen.getByRole('link');
    expect(link).toHaveClass('custom-class');
  });

  it('completes cleanup before navigation', async () => {
    const mockOnClick = jest.fn().mockImplementation(() => Promise.resolve());

    render(
      <NavigationLink
        path="/test"
        name="Test Link"
        currentPath="/other"
        onClick={mockOnClick}
      />
    );

    const link = screen.getByRole('link');
    await act(async () => {
      fireEvent.click(link);
      // Wait for all promises to resolve
      await Promise.resolve();
    });

    // Verify order of operations
    expect(mockClearHistory).toHaveBeenCalled();
    expect(mockOnClick).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith('/test');

    // Verify order of execution
    const clearHistoryCall = mockClearHistory.mock.invocationCallOrder[0];
    const onClickCall = mockOnClick.mock.invocationCallOrder[0];
    const routerPushCall = mockRouter.push.mock.invocationCallOrder[0];

    expect(clearHistoryCall).toBeLessThan(onClickCall);
    expect(onClickCall).toBeLessThan(routerPushCall);
  });

  it('calls only clearHistory when no onClick provided', async () => {
    render(
      <NavigationLink
        path="/test"
        name="Test Link"
        currentPath="/other"
      />
    );

    const link = screen.getByRole('link');
    await act(async () => {
      fireEvent.click(link);
      await Promise.resolve();
    });

    expect(mockClearHistory).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith('/test');

    // Verify order of execution
    const clearHistoryCall = mockClearHistory.mock.invocationCallOrder[0];
    const routerPushCall = mockRouter.push.mock.invocationCallOrder[0];
    expect(clearHistoryCall).toBeLessThan(routerPushCall);
  });

  it('prevents default navigation behavior', async () => {
    render(
      <NavigationLink
        path="/test"
        name="Test Link"
        currentPath="/other"
      />
    );

    const link = screen.getByRole('link');
    let defaultPrevented = false;

    // Create a custom click event
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0
    });

    // Override preventDefault to track if it was called
    Object.defineProperty(clickEvent, 'preventDefault', {
      value: () => { defaultPrevented = true; }
    });

    // Dispatch the event
    await act(async () => {
      link.dispatchEvent(clickEvent);
      await Promise.resolve();
    });

    expect(defaultPrevented).toBe(true);
  });
});
