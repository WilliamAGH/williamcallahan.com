import React from "react";
import { render, screen } from "@testing-library/react";
import { PaginationControlUrl } from "@/components/ui/pagination-control-url.client";
import { useSearchParams } from "next/navigation";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
}));

// Mock Link component to avoid router context issues
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("PaginationControlUrl", () => {
  const mockUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;

  beforeEach(() => {
    // Mock URLSearchParams
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders pagination controls when there are multiple pages", () => {
    render(<PaginationControlUrl currentPage={2} totalPages={5} totalItems={100} itemsPerPage={24} />);

    // Check that page numbers are rendered
    expect(screen.getByLabelText("Go to page 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Current page 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to page 3")).toBeInTheDocument();

    // Check navigation buttons
    expect(screen.getByLabelText("Go to previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("Go to next page")).toBeInTheDocument();
  });

  it("does not render when there is only one page", () => {
    const { container } = render(
      <PaginationControlUrl currentPage={1} totalPages={1} totalItems={10} itemsPerPage={24} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("generates correct URLs for pagination", () => {
    render(
      <PaginationControlUrl currentPage={3} totalPages={5} totalItems={100} itemsPerPage={24} baseUrl="/bookmarks" />,
    );

    // Page 1 should link to base URL
    const page1Link = screen.getByLabelText("Go to page 1");
    expect(page1Link.getAttribute("href")).toBe("/bookmarks");

    // Page 2 should have /page/2
    const page2Link = screen.getByLabelText("Go to page 2");
    expect(page2Link.getAttribute("href")).toBe("/bookmarks/page/2");

    // Page 4 should have /page/4
    const page4Link = screen.getByLabelText("Go to page 4");
    expect(page4Link.getAttribute("href")).toBe("/bookmarks/page/4");
  });

  it("preserves query parameters in pagination links", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("q=test&tag=javascript"));

    render(
      <PaginationControlUrl currentPage={2} totalPages={5} totalItems={100} itemsPerPage={24} baseUrl="/bookmarks" />,
    );

    const page3Link = screen.getByLabelText("Go to page 3");
    expect(page3Link.getAttribute("href")).toBe("/bookmarks/page/3?q=test&tag=javascript");
  });

  it("disables appropriate buttons at boundaries", () => {
    // First page
    const { rerender } = render(
      <PaginationControlUrl currentPage={1} totalPages={5} totalItems={100} itemsPerPage={24} />,
    );

    expect(screen.getByLabelText("Go to previous page")).toBeDisabled();
    expect(screen.getByLabelText("Go to first page")).toBeDisabled();

    // Last page
    rerender(<PaginationControlUrl currentPage={5} totalPages={5} totalItems={100} itemsPerPage={24} />);

    expect(screen.getByLabelText("Go to next page")).toBeDisabled();
    expect(screen.getByLabelText("Go to last page")).toBeDisabled();
  });

  it("shows correct page info", () => {
    render(
      <PaginationControlUrl currentPage={2} totalPages={5} totalItems={100} itemsPerPage={24} showPageInfo={true} />,
    );

    expect(screen.getByText("Showing 25-48 of 100 bookmarks")).toBeInTheDocument();
  });
});
