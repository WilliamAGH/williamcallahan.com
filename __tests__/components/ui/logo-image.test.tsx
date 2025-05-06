/* eslint-disable @next/next/no-img-element */
/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { LogoImage } from '../../../components/ui/logo-image.client';
import { mock, describe, it, expect } from 'bun:test';
import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";

// Note: We are avoiding jest-dom matchers due to potential environment conflicts
// import { toHaveAttribute } from '@testing-library/jest-dom/matchers';
// expect.extend({ toHaveAttribute });

// Mock next/image using mock.module
mock.module('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt, priority, layout, objectFit, fill, ...props }: any) => { // Explicitly capture 'fill'
    // Determine layout based on 'fill' prop if 'layout' isn't provided
    const effectiveLayout = layout ?? (fill ? 'fill' : undefined);
    // Remove 'fill' from props being spread to avoid the warning
    const { fill: unusedFill, ...restProps } = props; // Renamed _fill to unusedFill

    return (
      <img
        src={src}
        alt={alt}
        data-testid="next-image-mock" // Keep test ID for the img itself
        data-layout={effectiveLayout} // Use determined layout
        data-object-fit={objectFit}
        data-priority={priority ? 'true' : undefined}
        {...restProps} // Spread remaining props (width, height, etc.), excluding 'fill'
      />
    );
  },
}));

// Static import after mocking
import Image from 'next/image';

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
      // Use basic attribute checks instead of toHaveAttribute
      expect(img.getAttribute('src')).toBe(regularUrlProps.src);
      expect(img.getAttribute('alt')).toBe('Company Logo'); // Default alt
      expect(img.getAttribute('data-layout')).toBe('fill');
      // Check the style attribute for objectFit
      expect(img.style.objectFit).toBe('contain');
      expect(img.hasAttribute('data-priority')).toBe(false); // Check absence directly

      // Check the component's wrapper div using its test ID
      const wrapper = screen.getByTestId('logo-image-wrapper'); // Corrected test ID
      // Use basic style and class checks
      expect(wrapper.style.width).toBe(`${regularUrlProps.width}px`);
      expect(wrapper.style.height).toBe(`${regularUrlProps.height}px`);
      expect(wrapper.classList.contains('relative')).toBe(true); // Default class from component
    });

    it('passes priority prop to next/image mock', () => {
      render(<LogoImage {...regularUrlProps} priority={true} />);
      // Use basic attribute check
      expect(screen.getByTestId('next-image-mock').getAttribute('data-priority')).toBe('true');
    });

     it('applies custom className to the component wrapper', () => {
      render(<LogoImage {...regularUrlProps} className="custom-class" />);
      // Check the component's wrapper div using its test ID
      const wrapper = screen.getByTestId('logo-image-wrapper'); // Corrected test ID
      // Use basic class checks
      expect(wrapper.classList.contains('relative')).toBe(true);
      expect(wrapper.classList.contains('custom-class')).toBe(true);
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
      // Use basic attribute checks
      expect(img.getAttribute('src')).toBe(dataUrlProps.src);
      expect(img.getAttribute('alt')).toBe('Company Logo'); // Default alt
      expect(img.getAttribute('width')).toBe(dataUrlProps.width.toString());
      expect(img.getAttribute('height')).toBe(dataUrlProps.height.toString());
      expect(img.getAttribute('loading')).toBe('lazy');
      // Use basic class check
      expect(img.classList.contains('object-contain')).toBe(true); // Default class
    });

     it('applies custom className to the plain img tag', () => {
      render(<LogoImage {...dataUrlProps} className="custom-img-class" />);
      const img = screen.getByRole('img');
      // Use basic class checks
      expect(img.classList.contains('object-contain')).toBe(true);
      expect(img.classList.contains('custom-img-class')).toBe(true);
    });

     it('ignores priority prop for plain img tag', () => {
       // Priority is a next/image specific prop
      render(<LogoImage {...dataUrlProps} priority={true} />);
      const img = screen.getByRole('img');
      // Use basic attribute checks for absence
      expect(img.hasAttribute('priority')).toBe(false);
      expect(img.hasAttribute('data-priority')).toBe(false);
    });
  });
});
