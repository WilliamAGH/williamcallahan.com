/**
 * @file Projects List Server Component
 * @module components/features/projects/projects-list.server
 *
 * @description
 * Server component that pre-renders the projects list for optimal performance.
 * This component is rendered on the server before being sent to the client,
 * enabling faster initial page loads.
 *
 * @serverComponent - This component should only be used in a server context.
 */

import { projects } from '@/data/projects';
import { ProjectCardServer } from './project-card.server';
import GitHubActivity from '@/components/features/github/github-activity.client';
import { ServerComponent } from '@/types/component-types';

/**
 * Props for the ProjectsListServer component
 */
interface ProjectsListServerProps {
  /**
   * Selected tag for filtering projects (defaults to 'All')
   */
  selectedTag?: string;
}

/**
 * Server component that pre-renders the projects list
 * This component renders project cards as static HTML for optimal performance
 *
 * @param {ProjectsListServerProps} props - Component props
 * @returns {Promise<JSX.Element>} Server-rendered projects list
 */
export async function ProjectsListServer({ selectedTag = 'All' }: ProjectsListServerProps): Promise<JSX.Element> {
  // Filter projects based on tag
  const filteredProjects = selectedTag === 'All'
    ? projects
    : projects.filter(p => p.tags?.includes(selectedTag));

  // Calculate all unique tags for filter buttons
  const allTags = ['All', ...Array.from(new Set(projects.flatMap(p => p.tags || []))).sort()];

  return (
    <div className="p-6 sm:p-4">
      <div className="prose dark:prose-invert max-w-none mb-8 text-sm sm:text-base">
        <p>
          Welcome to my sandbox of various experiments / projects / works-in-progress.
        </p>
      </div>

      {/* Filter Buttons - these will be hydrated by client component */}
      <div className="mb-8 flex-wrap gap-2 hidden sm:flex">
        {allTags.map(tag => (
          <button
            key={tag}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200 ${
              selectedTag === tag
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
            }`}
            data-tag={tag}
            aria-pressed={selectedTag === tag}
            disabled={true} // Since this is server-rendered and will be hydrated by client
          >
            {tag}
          </button>
        ))}
      </div>

      {/* GitHub Activity */}
      <GitHubActivity />

      {/* Projects List */}
      <div className="space-y-8 mt-8">
        {filteredProjects.map((project) => (
          <div key={project.name}>
            <ProjectCardServer project={project} />
          </div>
        ))}
      </div>
    </div>
  );
}