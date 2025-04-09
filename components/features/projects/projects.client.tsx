/**
 * Projects Component
 * Using hybrid architecture with server components for content
 * and client components for interactivity
 */

import { ProjectsWindow } from './projects-window.client';
import { ProjectsListServer } from './projects-list.server';

export function ProjectsClient() {
  return (
    <ProjectsWindow>
      <ProjectsListServer />
    </ProjectsWindow>
  );
}
