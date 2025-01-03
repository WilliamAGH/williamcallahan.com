/**
 * Education Page
 *
 * Displays educational background and certifications.
 */

import type { Metadata } from 'next';
import { Education } from '../../components/features/education/education.server';
import { DOMAIN } from '../../lib/seo';

export const metadata: Metadata = {
  title: 'Education Background - William Callahan',
  description: 'Learn about William Callahan\'s educational background, including academic achievements and professional certifications.',
  alternates: {
    canonical: `${DOMAIN}/education`,
  },
  openGraph: {
    title: 'William Callahan - Education',
    description: 'Educational background and academic achievements of William Callahan',
    type: 'profile',
    url: `${DOMAIN}/education`,
  },
  twitter: {
    card: 'summary',
    title: 'William Callahan - Education',
    description: 'Educational background and academic achievements of William Callahan',
  },
};

export default function EducationPage() {
  return <Education />;
}
