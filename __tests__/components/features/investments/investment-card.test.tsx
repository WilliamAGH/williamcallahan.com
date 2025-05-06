/**
 * Investment Card Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { InvestmentCardClient } from '@/components/features/investments/investment-card.client';
import { mock, jest, describe, it, expect } from 'bun:test';
import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";

// Mock the external link component using mock.module
mock.module('../../../../components/ui/external-link.client', () => ({
  ExternalLink: ({ children, href, title, className }: any) => (
    <a href={href} title={title} className={className} data-testid="external-link">
      {children}
    </a>
  ),
}));

// We don't need to mock the AVenture icon component anymore since we're using an img directly

// Mock the LogoImage component using mock.module
mock.module('../../../../components/ui', () => ({
  LogoImage: () => <div data-testid="logo-image" />,
}));

// Mock the FinancialMetrics component using mock.module
mock.module('../../../../components/ui/financial-metrics.server', () => ({
  __esModule: true,
  default: () => <div data-testid="financial-metrics" />,
}));

// Import after mocking
import { ExternalLink } from '../../../../components/ui/external-link.client';
import { LogoImage } from '../../../../components/ui';
import FinancialMetrics from '../../../../components/ui/financial-metrics.server';

describe('InvestmentCardClient', () => {
  const defaultProps = {
    id: 'test-investment',
    name: 'Test Company',
    description: 'A test company',
    type: 'Startup',
    stage: 'Seed',
    invested_year: '2023',
    status: 'Active' as const,
    operating_status: 'Operating' as const,
    multiple: 1.5,
    holding_return: 0.5,
    logoData: {
      url: '/test-logo.png',
      source: 'test',
    },
    website: 'https://example.com',
  };

  it('renders correctly with basic props', () => {
    render(<InvestmentCardClient {...defaultProps} />);

    expect(screen.getByText('Test Company')).toBeInTheDocument();
    expect(screen.getByText('A test company')).toBeInTheDocument();
    expect(screen.getByText('Seed')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows aVenture icon when aventure_url is provided', () => {
    const propsWithAVenture = {
      ...defaultProps,
      aventure_url: 'https://aventure.vc/companies/test-company',
    };

    render(<InvestmentCardClient {...propsWithAVenture} />);

    // Check if the aVenture favicon image is rendered
    const aventureIcon = screen.getByTestId('aventure-icon');
    expect(aventureIcon).toBeInTheDocument();
    expect(aventureIcon).toHaveAttribute('src', '/images/aVenture Favicon.png');
    expect(aventureIcon).toHaveAttribute('alt', 'aVenture');

    // Check if the link has the correct URL and title
    const aventureLink = screen.getAllByTestId('external-link').find(
      link => link.getAttribute('href') === 'https://aventure.vc/companies/test-company'
    );
    expect(aventureLink).toBeInTheDocument();
    expect(aventureLink).toHaveAttribute('title', 'Test Company - aVenture Startup Research');
  });

  it('does not show aVenture icon when aventure_url is not provided', () => {
    render(<InvestmentCardClient {...defaultProps} />);

    // Check that aVenture icon is not rendered
    expect(screen.queryByTestId('aventure-icon')).not.toBeInTheDocument();
  });
});