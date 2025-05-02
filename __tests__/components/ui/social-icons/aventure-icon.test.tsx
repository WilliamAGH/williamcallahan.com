/**
 * AVenture Icon Component Tests
 */

import React from 'react';
import { render } from '@testing-library/react';
import { AVenture } from '@/components/ui/social-icons/aventure-icon';

describe('AVenture Icon', () => {
  it('renders correctly', () => {
    const { container } = render(<AVenture data-testid="aventure-icon" />);
    
    // Check if SVG was rendered
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    
    // Check if the path for the icon exists
    const path = container.querySelector('path');
    expect(path).toBeInTheDocument();
  });

  it('passes className prop to the SVG', () => {
    const testClass = 'test-class';
    const { container } = render(<AVenture className={testClass} />);
    
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass(testClass);
  });

  it('passes additional props to the SVG', () => {
    const { getByTestId } = render(<AVenture data-testid="aventure-icon" />);
    
    expect(getByTestId('aventure-icon')).toBeInTheDocument();
  });
});