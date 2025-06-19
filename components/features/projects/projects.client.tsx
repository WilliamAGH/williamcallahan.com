"use client";

/**
 * Projects Component
 * Using hybrid architecture with server components for content
 * and client components for interactivity
 */

import { projects } from "@/data/projects";
import { ProjectTagsClient } from "./project-tags.client";
import { ProjectsWindow } from "./projects-window.client";

export function ProjectsClient() {
  return (
    <div className="relative">
      <ProjectTagsClient />
      <ProjectsWindow projects={projects} />
      {/* ProjectsListServer is now imported and rendered by the page,
          not directly by this client component */}
    </div>
  );
}
