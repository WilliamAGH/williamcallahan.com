/**
 * Projects Page
 *
 * This page displays a list of my personal projects / sandbox
 * It uses the ProjectsClient component to render the projects
 *
 */

import type { Metadata } from 'next';

import { ProjectsClient } from '@/components/features/projects/projects.client';
import { getStaticPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = getStaticPageMetadata('/projects', 'projects');

/**
 * Enable ISR for projects page with hourly revalidation
 * This generates static HTML at build time and revalidates periodically
 */
export const revalidate = 3600; // Revalidate every hour

export default function ProjectsPage() {
  return (
    <div className="max-w-5xl mx-auto"> {/* Added container div */}
      <ProjectsClient />
    </div>
  );
}
