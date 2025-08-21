/**
 * Investment Card Component Tests
 */

// @typescript-eslint/ban-ts-comment

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { InvestmentCardClient } from "../../../../components/features/investments/investment-card.client";
import type { MockExternalLinkProps } from "@/types/test";
// Mock lucide-react icons
jest.mock("lucide-react", () => ({
  ExternalLink: (props: any) => <svg {...props} data-testid="external-link-icon" />,
}));

// Mock the external link component using jest.mock
jest.mock("../../../../components/ui/external-link.client", () => ({
  ExternalLink: ({ children, href, title, className }: MockExternalLinkProps) => (
    <a href={href} title={title} className={className} data-testid="external-link">
      {children}
    </a>
  ),
}));

// We don't need to mock the aVenture icon component anymore since we're using an img directly

// Mock the LogoImage component using jest.mock
jest.mock("../../../../components/ui", () => ({
  LogoImage: () => <div data-testid="logo-image" />,
}));

// Mock the FinancialMetrics component using jest.mock
jest.mock("../../../../components/ui/financial-metrics.server", () => ({
  __esModule: true,
  default: () => <div data-testid="financial-metrics" />,
}));

// Imports after mocking are not needed as the mocks are used directly by the component under test.

describe("InvestmentCardClient", () => {
  const defaultProps = {
    id: "aventure-investment",
    name: "aVenture",
    description: "A venture capital firm",
    type: "Startup",
    stage: "Seed",
    invested_year: "2023",
    status: "Active" as const,
    operating_status: "Operating" as const,
    multiple: 1.5,
    holding_return: 0.5,
    logoData: {
      url: "/aventure-logo.png",
      source: "test",
    },
    website: "https://aventure.vc",
  };

  it("renders correctly with basic props", () => {
    render(<InvestmentCardClient {...defaultProps} />);

    expect(screen.getByText("aVenture")).toBeInTheDocument();
    expect(screen.getByText("A venture capital firm")).toBeInTheDocument();
    expect(screen.getByText("Seed")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows aVenture icon when aventure_url is provided", () => {
    const propsWithaVenture = {
      ...defaultProps,
      aventure_url: "https://aventure.vc/companies/aventure-venture-capital-san-francisco-ca-usa",
    };

    render(<InvestmentCardClient {...propsWithaVenture} />);

    // Check if the aVenture favicon image is rendered
    const aventureIcon = screen.getByTestId("aventure-icon");
    expect(aventureIcon).toBeInTheDocument();
    expect(aventureIcon).toHaveAttribute(
      "src",
      "https://s3-storage.callahan.cloud/images/ui-components/aVenture-research-button.png",
    );
    expect(aventureIcon).toHaveAttribute("alt", "aVenture");

    // Check if the aVenture link with correct URL exists
    // We need to target the specific link with the aVenture research URL
    const aventureLinks = screen.getAllByRole("link");
    const aventureLink = aventureLinks.find(
      link =>
        link.getAttribute("href") === "https://aventure.vc/companies/aventure-venture-capital-san-francisco-ca-usa",
    );
    expect(aventureLink).toBeInTheDocument();
    expect(aventureLink).toHaveAttribute("title", "aVenture - aVenture Startup Research");
  });

  it("does not show aVenture icon when aventure_url is not provided", () => {
    render(<InvestmentCardClient {...defaultProps} />);

    // Check that aVenture icon is not rendered
    expect(screen.queryByTestId("aventure-icon")).not.toBeInTheDocument();
  });
});
