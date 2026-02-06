"use client";

/**
 * Projects Component
 * Using hybrid architecture with server components for content
 * and client components for interactivity
 */

import { Suspense } from "react";
import { projects } from "@/data/projects";
import { ProjectTagsClient, ProjectTagsFallback } from "./project-tags.client";
import { ProjectsWindow } from "./projects-window.client";

export function ProjectsClient() {
  return (
    <div className="relative">
      <Suspense fallback={<ProjectTagsFallback />}>
        <ProjectTagsClient />
      </Suspense>
      <ProjectsWindow data={{ projects }} />
      {/* ProjectsListServer is now imported and rendered by the page,
          not directly by this client component */}
    </div>
  );
}
