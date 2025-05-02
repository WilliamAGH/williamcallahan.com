/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LogoImage } from '../../../components/ui/logo-image.client';

// Mock next/image for testing the non-data URL path
jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, priority, layout, objectFit, ...props }: any) => {
    // Simplified mock: Render only the img tag, not a wrapper
    return (
      <img
        src={src}
        alt={alt}
        data-testid="next-image-mock" // Keep test ID for the img itself
        data-layout={layout}
        data-object-fit={objectFit}
        data-priority={priority ? 'true' : undefined}
        // unoptimized is not passed in this path anymore
        {...props} // Pass width/height etc. if needed by underlying img
      />
    );
  },
}));

describe('LogoImage Conditional Rendering', () => {
  const regularUrlProps = {
    src: 'https://example.com/logo.png',
    width: 100,
    height: 100,
  };

  const dataUrlProps = {
    src: 'data:image/svg+xml;base64,abc123', // Use a sample SVG data URL
    width: 50,
    height: 50,
  };

  describe('Regular URL Rendering (uses next/image)', () => {
    it('renders next/image mock and wrapper with correct props', () => {
      render(<LogoImage {...regularUrlProps} />);
      // Check the next/image mock img tag
      const img = screen.getByTestId('next-image-mock');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', regularUrlProps.src);
      expect(img).toHaveAttribute('alt', 'Company Logo'); // Default alt
      expect(img).toHaveAttribute('data-layout', 'fill');
      expect(img).toHaveAttribute('data-object-fit', 'contain');
      expect(img).not.toHaveAttribute('data-priority');

      // Check the component's wrapper div using its test ID
      const wrapper = screen.getByTestId('logo-image-wrapper'); // Corrected test ID
      expect(wrapper).toHaveStyle(`width: ${regularUrlProps.width}px`);
      expect(wrapper).toHaveStyle(`height: ${regularUrlProps.height}px`);
      expect(wrapper).toHaveClass('relative'); // Default class from component
    });

    it('passes priority prop to next/image mock', () => {
      render(<LogoImage {...regularUrlProps} priority={true} />);
      expect(screen.getByTestId('next-image-mock')).toHaveAttribute('data-priority', 'true');
    });

     it('applies custom className to the component wrapper', () => {
      render(<LogoImage {...regularUrlProps} className="custom-class" />);
      // Check the component's wrapper div using its test ID
      const wrapper = screen.getByTestId('logo-image-wrapper'); // Corrected test ID
      expect(wrapper).toHaveClass('relative');
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('Data URL Rendering (uses plain <img>)', () => {
    it('renders plain img tag with correct props', () => {
      render(<LogoImage {...dataUrlProps} />);
      // Check if the plain img tag was rendered (and not the next/image mock)
      expect(screen.queryByTestId('next-image-mock')).not.toBeInTheDocument();
      expect(screen.queryByTestId('logo-image-wrapper')).not.toBeInTheDocument(); // Wrapper shouldn't exist for plain img

      const img = screen.getByRole('img'); // Get the plain img tag
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', dataUrlProps.src);
      expect(img).toHaveAttribute('alt', 'Company Logo'); // Default alt
      expect(img).toHaveAttribute('width', dataUrlProps.width.toString());
      expect(img).toHaveAttribute('height', dataUrlProps.height.toString());
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img).toHaveClass('object-contain'); // Default class
    });

     it('applies custom className to the plain img tag', () => {
      render(<LogoImage {...dataUrlProps} className="custom-img-class" />);
      const img = screen.getByRole('img');
      expect(img).toHaveClass('object-contain');
      expect(img).toHaveClass('custom-img-class');
    });

     it('ignores priority prop for plain img tag', () => {
       // Priority is a next/image specific prop
      render(<LogoImage {...dataUrlProps} priority={true} />);
      const img = screen.getByRole('img');
      expect(img).not.toHaveAttribute('priority');
      expect(img).not.toHaveAttribute('data-priority');
    });
  });
});
