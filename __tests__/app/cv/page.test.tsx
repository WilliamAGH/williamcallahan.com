/**
 * CvPage server component tests
 */

import type { MockedFunction } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/features/cv/CvPdfDownloadButton", () => ({
  __esModule: true,
  default: vi.fn(() => null),
}));

import CvPage from "@/app/cv/page";
import CvPdfDownloadButtonEnhancer from "@/components/features/cv/CvPdfDownloadButton";

const mockEnhancer = CvPdfDownloadButtonEnhancer as MockedFunction<
  typeof CvPdfDownloadButtonEnhancer
>;

describe("CvPage", () => {
  afterEach(() => {
    vi.useRealTimers();
    mockEnhancer.mockClear();
    vi.clearAllMocks();
  });

  it("renders curriculum vitae sections without qualifications", async () => {
    vi.useFakeTimers({ now: new Date("2025-11-08T12:00:00Z") });

    const page = await Promise.resolve(CvPage());
    render(page);

    expect(screen.getByRole("heading", { name: "Professional Summary" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Highlighted Technical Projects" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Professional Experience" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Education" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Technical Focus" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Distinguished Qualifications" })).toBeNull();
    expect(screen.getByText("Last updated: November 8, 2025")).toBeInTheDocument();
  });

  it("wires the download enhancer and renders contact links", async () => {
    vi.useFakeTimers({ now: new Date("2025-11-08T00:00:00Z") });

    const page = await Promise.resolve(CvPage());
    render(page);

    expect(mockEnhancer).toHaveBeenCalledTimes(1);
    expect(mockEnhancer.mock.calls[0]?.[0]).toEqual({ targetId: "cv-pdf-download-button" });

    expect(screen.getByRole("link", { name: "williamcallahan.com" })).toHaveAttribute(
      "href",
      "https://williamcallahan.com",
    );
    const aventureLinks = screen.getAllByRole("link", { name: "aventure.vc" });
    expect(aventureLinks.some((link) => link.getAttribute("href") === "https://aventure.vc")).toBe(
      true,
    );
    expect(screen.getByRole("link", { name: "@williamcallahan" })).toHaveAttribute(
      "href",
      "https://twitter.com/williamcallahan",
    );
    expect(screen.getByRole("link", { name: "linkedin.com/in/williamacallahan" })).toHaveAttribute(
      "href",
      "https://linkedin.com/in/williamacallahan",
    );
  });
});
