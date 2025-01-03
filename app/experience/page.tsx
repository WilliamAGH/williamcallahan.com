/**
 * Experience Page
 *
 * Displays professional experience and work history.
 * Shows timeline of career progression.
 */

import type { Metadata } from 'next';
import { Experience } from '../../components/features/experience';
import { API_BASE_URL } from '../../lib/constants';

export const metadata: Metadata = {
  title: 'Professional Experience - William Callahan',
  description: 'Explore William Callahan\'s professional experience, including roles in software engineering, entrepreneurship, and technology leadership.',
  alternates: {
    canonical: `${API_BASE_URL}/experience`,
  },
  openGraph: {
    title: 'William Callahan - Professional Experience',
    description: 'Professional experience and career highlights of William Callahan',
    type: 'profile',
    url: `${API_BASE_URL}/experience`,
  },
  twitter: {
    card: 'summary',
    title: 'William Callahan - Professional Experience',
    description: 'Professional experience and career highlights of William Callahan',
  },
};

// Force static generation
export const revalidate = false;

export default function ExperiencePage() {
  return <Experience />;
}
