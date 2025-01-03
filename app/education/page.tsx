/**
 * Education Page
 *
 * Displays educational background and certifications.
 */

import type { Metadata } from 'next';
import { Education } from '../../components/features/education/education.server';
import { API_BASE_URL } from '../../lib/constants';

export const metadata: Metadata = {
  title: 'Education Background - William Callahan',
  description: 'Learn about William Callahan\'s educational background, including academic achievements and professional certifications.',
  alternates: {
    canonical: `${API_BASE_URL}/education`,
  },
  openGraph: {
    title: 'William Callahan - Education',
    description: 'Educational background and academic achievements of William Callahan',
    type: 'profile',
    url: `${API_BASE_URL}/education`,
  },
  twitter: {
    card: 'summary',
    title: 'William Callahan - Education',
    description: 'Educational background and academic achievements of William Callahan',
  },
};

// Force static generation
export const revalidate = false;

export default function EducationPage() {
  return <Education />;
}
