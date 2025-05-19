"use client";

/**
 * @file Projects List Client Component
 * @module components/features/projects/projects-list.client
 *
 * @description
 * Client component that renders projects list for use inside client components.
 * This component handles client-side filtering of projects.
 *
 * @clientComponent - This component uses client-side APIs and must be rendered on the client.
 */

import { projects } from '@/data/projects';
import { ProjectCard } from './project-card.client';
import GitHubActivity from '@/components/features/github/github-activity.client';
import { useSearchParams } from 'next/navigation';

/**
 * ProjectsList Client Component
 *
 * This component renders projects list and handles client-side filtering
 */
export function ProjectsListClient() {
  const searchParams = useSearchParams();
  const selectedTag = searchParams?.get('tag') || 'All';

  // Filter projects based on tag
  const filteredProjects = selectedTag === 'All'
    ? projects
    : projects.filter(p => p.tags?.includes(selectedTag));

  return (
    <div className="p-6 sm:p-4">
      <div className="prose dark:prose-invert max-w-none mb-8 text-sm sm:text-base">
        <p>
          Welcome to my coding lab! Here, I experiment with building things, share works-in-progress, and share my current and past projects.
        </p>
      </div>

      {/* GitHub Activity */}
      <GitHubActivity />

      {/* Projects List */}
      <div className="space-y-8 mt-8">
        {filteredProjects.map((project) => (
          <div key={project.name}>
            <ProjectCard project={project} />
          </div>
        ))}
      </div>
    </div>
  );
}