/**
 * @file Projects List Server Component (was client)
 * @module components/features/projects/projects-list.client
 *
 * @description
 * Server component that renders the full list of projects.  By executing on the
 * server, the <Image> markup for each project card is included in the initial
 * HTML so the browser can start downloading screenshots immediately (improves
 * LCP).
 *
 * Tag-based filtering remains a client concern (handled by ProjectTagsClient).
 * We still render every card here; the client layer simply hides those that are
 * not currently selected.  This avoids search-param coupling while giving us
 * server-rendered images.
 */

import GitHubActivity from "@/components/features/github/github-activity.client";
import { projects } from "@/data/projects";
import { ProjectCard } from "./project-card.client";

// Re-export under a clearer name
export const ProjectsListServer = ProjectsList;

/**
 * Server-rendered list of projects.
 */
function ProjectsList() {
  // Render all projects – filtering is handled client-side by toggling CSS.

  return (
    <div className="p-6 sm:p-4">
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Project Showcase</h2>
        <div className="prose dark:prose-invert max-w-none mb-8 text-sm sm:text-base">
          <p>
            Welcome to my coding lab! Here, I experiment with building things, share works-in-progress, and showcase my
            current and past projects.
          </p>
        </div>

        {/* GitHub Activity */}
        {/* This component is still client-side and will hydrate normally */}
        <GitHubActivity />

        {/* Projects List */}
        <div className="space-y-8 mt-8">
          {projects.map((project, index) => (
            <div
              key={project.name}
              data-project-tags={project.tags?.join("|||") ?? ""} // custom delimiter preserves spaces
            >
              <ProjectCard project={project} isPriority={index === 0} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
