import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useTheme } from 'next-themes';
import { LogoImage } from '../../../components/ui/logoImage';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className, onError, priority, unoptimized, ...props }: any) => (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={onError}
      priority={priority ? "true" : undefined}
      unoptimized={unoptimized ? "true" : undefined}
      {...props}
    />
  )
}));

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn()
}));

describe('LogoImage', () => {
  const mockProps = {
    url: 'https://example.com/logo.png',
    width: 100,
    height: 100
  };

  beforeEach(() => {
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders with provided URL', () => {
      render(<LogoImage {...mockProps} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', mockProps.url);
      expect(img).toHaveAttribute('width', mockProps.width.toString());
      expect(img).toHaveAttribute('height', mockProps.height.toString());
    });

    it('uses default alt text when not provided', () => {
      render(<LogoImage {...mockProps} />);
      expect(screen.getByRole('img')).toHaveAttribute('alt', 'Company Logo');
    });

    it('uses custom alt text when provided', () => {
      render(<LogoImage {...mockProps} alt="Custom Alt" />);
      expect(screen.getByRole('img')).toHaveAttribute('alt', 'Custom Alt');
    });

    it('applies custom className', () => {
      render(<LogoImage {...mockProps} className="custom-class" />);
      expect(screen.getByRole('img')).toHaveClass('custom-class');
    });
  });

  describe('Error Handling', () => {
    it('shows placeholder when URL is empty', async () => {
      render(<LogoImage {...mockProps} url="" />);

      await act(async () => {
        await Promise.resolve();
      });

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/images/company-placeholder.svg');
      expect(img).toHaveClass('opacity-50');
    });

    it('shows placeholder on image load error', async () => {
      render(<LogoImage {...mockProps} />);

      await act(async () => {
        await Promise.resolve();
      });

      const img = screen.getByRole('img');
      fireEvent.error(img);

      await act(async () => {
        await Promise.resolve();
      });

      expect(img).toHaveAttribute('src', '/images/company-placeholder.svg');
      expect(img).toHaveClass('opacity-50');
    });

    it('attempts API fallback when local image fails', async () => {
      const website = 'https://example.com';
      const { rerender } = render(
        <LogoImage {...mockProps} url="https://example.com/logo.png" website={website} />
      );

      // Wait for initial render
      await act(async () => {
        await Promise.resolve();
      });

      // Verify initial URL
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/logo.png');

      // Trigger error to force API fallback
      fireEvent.error(img);

      // Wait for state updates
      await act(async () => {
        await Promise.resolve();
      });

      // Force a re-render to ensure state updates are reflected
      rerender(
        <LogoImage {...mockProps} url="https://example.com/logo.png" website={website} />
      );

      // Verify fallback URL
      expect(img).toHaveAttribute(
        'src',
        `/api/logo?website=${encodeURIComponent(website)}`
      );
    });

    it('shows placeholder after API fallback fails', async () => {
      const website = 'https://example.com';
      render(
        <LogoImage {...mockProps} url="https://example.com/logo.png" website={website} />
      );

      // Wait for initial render
      await act(async () => {
        await Promise.resolve();
      });

      const img = screen.getByRole('img');

      // Trigger first error to force API fallback
      fireEvent.error(img);

      await act(async () => {
        await Promise.resolve();
      });

      // Trigger second error on API fallback
      fireEvent.error(img);

      await act(async () => {
        await Promise.resolve();
      });

      // Should show placeholder
      expect(img).toHaveAttribute('src', '/images/company-placeholder.svg');
      expect(img).toHaveClass('opacity-50');
    });
  });

  describe('URL Handling', () => {
    it('uses URL directly for non-API paths', async () => {
      const directUrl = '/images/logo.png';
      render(<LogoImage {...mockProps} url={directUrl} />);

      // Wait for useEffect
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole('img')).toHaveAttribute('src', directUrl);
    });

    it('handles API route URLs', async () => {
      const apiUrl = '/api/logo/123';
      render(<LogoImage {...mockProps} url={apiUrl} />);

      // Wait for useEffect
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole('img')).toHaveAttribute('src', apiUrl);
    });

    it('sets unoptimized prop for data URLs', async () => {
      const dataUrl = 'data:image/png;base64,abc123';
      render(<LogoImage {...mockProps} url={dataUrl} />);

      // Wait for useEffect
      await act(async () => {
        await Promise.resolve();
      });

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', dataUrl);
      expect(img).toHaveAttribute('unoptimized', 'true');
    });

    it('does not set unoptimized prop for regular URLs', async () => {
      render(<LogoImage {...mockProps} />);

      // Wait for useEffect
      await act(async () => {
        await Promise.resolve();
      });

      const img = screen.getByRole('img');
      expect(img).not.toHaveAttribute('unoptimized');
    });
  });

  describe('Theme Integration', () => {
    it('updates when theme changes', async () => {
      // Start with light theme
      (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
      const { rerender } = render(<LogoImage {...mockProps} />);

      // Wait for initial render
      await act(async () => {
        await Promise.resolve();
      });

      // Change to dark theme
      (useTheme as jest.Mock).mockReturnValue({ theme: 'dark' });
      rerender(<LogoImage {...mockProps} />);

      // Wait for theme change effect
      await act(async () => {
        await Promise.resolve();
      });

      // Image should still be rendered
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('handles loading states correctly', async () => {
      // Test empty URL
      const { rerender } = render(<LogoImage {...mockProps} url="" />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole('img')).toHaveAttribute('src', '/images/company-placeholder.svg');

      // Test valid URL
      rerender(<LogoImage {...mockProps} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole('img')).toHaveAttribute('src', mockProps.url);

      // Test API URL
      const apiUrl = '/api/logo/123';
      rerender(<LogoImage {...mockProps} url={apiUrl} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole('img')).toHaveAttribute('src', apiUrl);
    });

    it('handles errors gracefully', () => {
      const { rerender } = render(<LogoImage {...mockProps} />);
      const img = screen.getByRole('img');

      // Trigger error
      fireEvent.error(img);
      expect(img).toHaveAttribute('src', '/images/company-placeholder.svg');
      expect(img).toHaveClass('opacity-50');

      // Test recovery
      const newUrl = 'https://example.com/new-logo.png';
      rerender(<LogoImage {...mockProps} url={newUrl} />);
      expect(screen.getByRole('img')).toHaveAttribute('src', newUrl);
    });
  });

  describe('Error Recovery', () => {
    it('recovers when URL changes after error', async () => {
      const { rerender } = render(<LogoImage {...mockProps} />);

      // Trigger error
      const img = screen.getByRole('img');
      fireEvent.error(img);
      expect(img).toHaveAttribute('src', '/images/company-placeholder.svg');

      // Change URL
      const newUrl = 'https://example.com/new-logo.png';
      rerender(<LogoImage {...mockProps} url={newUrl} />);

      // Wait for update
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByRole('img')).toHaveAttribute('src', newUrl);
    });
  });
});
