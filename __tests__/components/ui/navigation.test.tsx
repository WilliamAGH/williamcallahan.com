/**
 * Navigation Component Tests
 *
 * Tests navigation menu functionality and accessibility.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { Navigation } from '@/components/ui/navigation';

describe.skip('Navigation Component', () => {
  it('renders navigation menu', () => {
    render(<Navigation />);
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('toggles menu visibility', () => {
    render(<Navigation />);
    const button = screen.getByRole('button', { name: /toggle menu/i });
    const menu = screen.getByRole('dialog');

    // Initially hidden
    expect(menu).toHaveAttribute('aria-hidden', 'true');

    // Show menu
    fireEvent.click(button);
    expect(menu).toHaveAttribute('aria-hidden', 'false');

    // Hide menu
    fireEvent.click(button);
    expect(menu).toHaveAttribute('aria-hidden', 'true');
  });

  it('closes menu on escape key', () => {
    render(<Navigation />);
    const button = screen.getByRole('button', { name: /toggle menu/i });
    const menu = screen.getByRole('dialog');

    // Open menu
    fireEvent.click(button);
    expect(menu).toHaveAttribute('aria-hidden', 'false');

    // Press escape
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(menu).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows navigation links', () => {
    render(<Navigation />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });
});
