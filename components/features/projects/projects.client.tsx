"use client";

/**
 * Projects Component
 * Using hybrid architecture with server components for content
 * and client components for interactivity
 */

import { ProjectTagsClient } from "./project-tags.client";
import { ProjectsWindow } from "./projects-window.client";

export function ProjectsClient() {
  return (
    <ProjectsWindow>
      <div className="relative">
        <ProjectTagsClient />
        {/* ProjectsListServer is now imported and rendered by the page,
            not directly by this client component */}
      </div>
    </ProjectsWindow>
  );
}
