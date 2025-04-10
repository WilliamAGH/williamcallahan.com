import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationLink } from '../../../../components/ui/navigation/navigation-link.client';
import { useTerminalContext } from '../../../../components/ui/terminal/terminal-context.client';

// Mock the terminal context
jest.mock('../../../../components/ui/terminal/terminal-context.client', () => ({
  useTerminalContext: jest.fn()
}));

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, ...props }: any) => {
    return <a {...props}>{children}</a>;
  };
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('NavigationLink', () => {
  const mockClearHistory = jest.fn();

  beforeEach(() => {
    (useTerminalContext as jest.Mock).mockReturnValue({
      clearHistory: mockClearHistory
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  it('calls clearHistory and onClick when clicked', () => {
    const mockOnClick = jest.fn();
    render(
      <NavigationLink
        path="/test"
        name="Test Link"
        currentPath="/other"
        onClick={mockOnClick}
      />
    );

    const link = screen.getByRole('link');
    fireEvent.click(link);

    expect(mockClearHistory).toHaveBeenCalled();
    expect(mockOnClick).toHaveBeenCalled();
  });

  it('calls only clearHistory when no onClick provided', () => {
    render(
      <NavigationLink
        path="/test"
        name="Test Link"
        currentPath="/other"
      />
    );

    const link = screen.getByRole('link');
    fireEvent.click(link);

    expect(mockClearHistory).toHaveBeenCalled();
  });
});
