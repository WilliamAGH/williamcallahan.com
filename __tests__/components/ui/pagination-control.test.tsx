/**
 * @fileoverview Unit tests for the PaginationControl component
 * @module __tests__/components/ui/pagination-control.test
 *
 * Tests the pagination control component including:
 * - Page navigation functionality
 * - Keyboard navigation support
 * - Loading and disabled states
 * - Responsive design behavior
 * - Edge cases and error handling
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaginationControl } from "@/components/ui/pagination-control.client";
import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import "@testing-library/jest-dom";

describe("PaginationControl", () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 10,
    totalItems: 100,
    itemsPerPage: 10,
    onPageChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test: Component should not render when there's only one page
   */
  it("should not render when totalPages is 1 or less", () => {
    const { container } = render(<PaginationControl {...defaultProps} totalPages={1} />);
    expect(container.firstChild).toBeNull();
  });

  /**
   * Test: Component should render correctly with multiple pages
   */
  it("should render pagination controls when totalPages > 1", () => {
    render(<PaginationControl {...defaultProps} />);

    // Check for page info
    expect(screen.getByText("Showing 1-10 of 100 bookmarks")).toBeInTheDocument();

    // Check for navigation buttons
    expect(screen.getByLabelText("Go to first page")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to next page")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to last page")).toBeInTheDocument();

    // Check for page numbers
    expect(screen.getByLabelText("Go to page 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to page 2")).toBeInTheDocument();
  });

  /**
   * Test: Clicking page numbers should trigger onPageChange
   */
  it("should call onPageChange when clicking page numbers", () => {
    const onPageChange = jest.fn();
    render(<PaginationControl {...defaultProps} onPageChange={onPageChange} />);

    const page2Button = screen.getByLabelText("Go to page 2");
    fireEvent.click(page2Button);

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  /**
   * Test: Navigation buttons should work correctly from first page
   */
  it("should handle navigation button clicks", () => {
    const onPageChange = jest.fn();
    const { rerender } = render(
      <PaginationControl {...defaultProps} currentPage={1} onPageChange={onPageChange} />,
    );

    // From page 1, test next button
    fireEvent.click(screen.getByLabelText("Go to next page"));
    expect(onPageChange).toHaveBeenCalledWith(2);

    // Simulate going to page 5
    rerender(<PaginationControl {...defaultProps} currentPage={5} onPageChange={onPageChange} />);

    onPageChange.mockClear();

    // From page 5, test previous button
    fireEvent.click(screen.getByLabelText("Go to previous page"));
    expect(onPageChange).toHaveBeenCalledWith(4);

    onPageChange.mockClear();

    // Test first page button
    fireEvent.click(screen.getByLabelText("Go to first page"));
    expect(onPageChange).toHaveBeenCalledWith(1);

    onPageChange.mockClear();

    // Test last page button
    fireEvent.click(screen.getByLabelText("Go to last page"));
    expect(onPageChange).toHaveBeenCalledWith(10);
  });

  /**
   * Test: Disabled state for boundary pages
   */
  it("should disable appropriate buttons on first and last pages", () => {
    // Test first page
    const { rerender } = render(<PaginationControl {...defaultProps} currentPage={1} />);

    expect(screen.getByLabelText("Go to first page")).toBeDisabled();
    expect(screen.getByLabelText("Go to previous page")).toBeDisabled();
    expect(screen.getByLabelText("Go to next page")).not.toBeDisabled();
    expect(screen.getByLabelText("Go to last page")).not.toBeDisabled();

    // Test last page
    rerender(<PaginationControl {...defaultProps} currentPage={10} />);

    expect(screen.getByLabelText("Go to first page")).not.toBeDisabled();
    expect(screen.getByLabelText("Go to previous page")).not.toBeDisabled();
    expect(screen.getByLabelText("Go to next page")).toBeDisabled();
    expect(screen.getByLabelText("Go to last page")).toBeDisabled();
  });

  /**
   * Test: Keyboard navigation support
   */
  it("should support keyboard navigation", () => {
    const onPageChange = jest.fn();
    const { rerender } = render(
      <PaginationControl {...defaultProps} currentPage={5} onPageChange={onPageChange} />,
    );

    const currentPageButton = screen.getByLabelText("Go to page 5");
    currentPageButton.focus();

    // Test arrow left
    fireEvent.keyDown(currentPageButton, { key: "ArrowLeft" });
    expect(onPageChange).toHaveBeenCalledWith(4);

    // Rerender with new page
    rerender(<PaginationControl {...defaultProps} currentPage={4} onPageChange={onPageChange} />);

    onPageChange.mockClear();

    // Test arrow right from page 4
    const page4Button = screen.getByLabelText("Go to page 4");
    page4Button.focus();
    fireEvent.keyDown(page4Button, { key: "ArrowRight" });
    expect(onPageChange).toHaveBeenCalledWith(5);

    onPageChange.mockClear();

    // Test Home key
    fireEvent.keyDown(page4Button, { key: "Home" });
    expect(onPageChange).toHaveBeenCalledWith(1);

    onPageChange.mockClear();

    // Test End key
    fireEvent.keyDown(page4Button, { key: "End" });
    expect(onPageChange).toHaveBeenCalledWith(10);
  });

  /**
   * Test: Loading state
   */
  it("should show loading indicator when isLoading is true", () => {
    render(<PaginationControl {...defaultProps} isLoading={true} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    // Check for spinner on current page button
    expect(
      screen.getByLabelText("Go to page 1").querySelector(".animate-spin"),
    ).toBeInTheDocument();
  });

  /**
   * Test: Ellipsis for large page ranges
   */
  it("should show ellipsis for large page ranges", () => {
    render(
      <PaginationControl {...defaultProps} currentPage={10} totalPages={20} maxVisiblePages={5} />,
    );

    // Should show page 1 with ellipsis
    expect(screen.getByLabelText("Go to page 1")).toBeInTheDocument();
    expect(screen.getAllByText("...")).toHaveLength(2); // Before and after visible range
    expect(screen.getByLabelText("Go to page 20")).toBeInTheDocument();
  });

  /**
   * Test: Current page indicator
   */
  it("should highlight current page with aria-current", () => {
    render(<PaginationControl {...defaultProps} currentPage={3} />);

    const currentPageButton = screen.getByLabelText("Go to page 3");
    expect(currentPageButton).toHaveAttribute("aria-current", "page");
    expect(currentPageButton).toHaveClass("bg-blue-600");
  });

  /**
   * Test: Empty state
   */
  it("should show 'No bookmarks found' when totalItems is 0", () => {
    render(
      <PaginationControl
        {...defaultProps}
        totalItems={0}
        totalPages={2} // Need > 1 to render the component
      />,
    );

    expect(screen.getByText("No bookmarks found")).toBeInTheDocument();
  });

  /**
   * Test: Page info calculation
   */
  it("should calculate page info correctly", () => {
    const { rerender } = render(
      <PaginationControl {...defaultProps} currentPage={1} totalItems={95} itemsPerPage={10} />,
    );

    expect(screen.getByText("Showing 1-10 of 95 bookmarks")).toBeInTheDocument();

    // Last page with partial items
    rerender(
      <PaginationControl
        {...defaultProps}
        currentPage={10}
        totalItems={95}
        itemsPerPage={10}
        totalPages={10}
      />,
    );

    expect(screen.getByText("Showing 91-95 of 95 bookmarks")).toBeInTheDocument();
  });

  /**
   * Test: Props control visibility
   */
  it("should respect showFirstLast and showPageInfo props", () => {
    const { rerender } = render(<PaginationControl {...defaultProps} showFirstLast={false} />);

    expect(screen.queryByLabelText("Go to first page")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Go to last page")).not.toBeInTheDocument();

    rerender(<PaginationControl {...defaultProps} showPageInfo={false} />);

    expect(screen.queryByText(/Showing \d+-\d+ of \d+ bookmarks/)).not.toBeInTheDocument();
  });

  /**
   * Test: Prevents duplicate page changes
   */
  it("should not call onPageChange when clicking current page", () => {
    const onPageChange = jest.fn();
    render(<PaginationControl {...defaultProps} currentPage={3} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByLabelText("Go to page 3"));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  /**
   * Test: All buttons disabled when disabled prop is true
   */
  it("should disable all buttons when disabled prop is true", () => {
    render(<PaginationControl {...defaultProps} disabled={true} />);

    const buttons = screen.getAllByRole("button");
    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });
});
