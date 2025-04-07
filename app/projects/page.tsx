import type { Metadata } from 'next';

import { ProjectsClient } from '@/components/features/projects/projects.server';
import { getStaticPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = getStaticPageMetadata('/projects', 'projects');

export default function ProjectsPage() {
  return (
    <div className="max-w-5xl mx-auto"> {/* Added container div */}
      <ProjectsClient />
    </div>
  );
}
