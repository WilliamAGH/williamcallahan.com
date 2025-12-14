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

import GitHubActivity from "@/components/features/github/github-activity.client";
import { projects } from "@/data/projects";
import { ProjectCardServer } from "./project-card.server";
import type { ProjectsListServerProps } from "@/types/features/projects";

import type { JSX } from "react";

/**
 * Server component that pre-renders the projects list
 * This component renders project cards as static HTML for optimal performance
 *
 * @param {ProjectsListServerProps} props - Component props
 * @returns {JSX.Element} Server-rendered projects list
 */
export function ProjectsListServer({ projects: projectsProp }: ProjectsListServerProps): JSX.Element {
  // Use provided projects or default to all projects
  const projectsToRender = projectsProp || projects;

  return (
    <div className="p-6 sm:p-4">
      <div className="prose dark:prose-invert max-w-none mb-8 text-sm sm:text-base">
        <p>
          Welcome to my coding lab! Here, I experiment with building things, share works-in-progress, and share my
          current and past projects.{" "}
        </p>
      </div>

      {/* GitHub Activity */}
      <GitHubActivity />

      {/* Projects List */}
      <div className="space-y-8 mt-8">
        {projectsToRender.map(project => (
          <div key={project.name}>
            <ProjectCardServer project={project} />
          </div>
        ))}
      </div>
    </div>
  );
}
