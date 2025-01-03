/**
 * Investments Page
 *
 * Showcases investment portfolio and strategy.
 * Highlights key investments and outcomes.
 */

import type { Metadata } from 'next';
import { Investments } from '../../components/features/investments';
import { investments } from '../../data/investments';
import { API_BASE_URL } from '../../lib/constants';

export const metadata: Metadata = {
  title: 'Investment Portfolio - William Callahan',
  description: 'View William Callahan\'s investment portfolio, including ventures, startups, and technology investments.',
  alternates: {
    canonical: `${API_BASE_URL}/investments`,
  },
  openGraph: {
    title: 'William Callahan - Investments',
    description: 'Investment portfolio and venture activities of William Callahan',
    type: 'profile',
    url: `${API_BASE_URL}/investments`,
  },
  twitter: {
    card: 'summary',
    title: 'William Callahan - Investments',
    description: 'Investment portfolio and venture activities of William Callahan',
  },
};

// Force static generation
export const revalidate = false;

export default function InvestmentsPage() {
  return <Investments investments={investments} />;
}
