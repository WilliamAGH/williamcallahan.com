import { getCachedAnalysis } from "@/lib/ai-analysis/reader.server";
import type { ProjectDetailProps } from "@/types/features/projects";
import { ProjectAiAnalysis } from "./project-ai-analysis.client";

/** Keep optional analysis reads and client interactions out of the static project shell. */
export async function ProjectDetailAnalysis({ project }: ProjectDetailProps) {
  const cachedAnalysis = await getCachedAnalysis("projects", project.id);

  return <ProjectAiAnalysis project={project} initialAnalysis={cachedAnalysis} defaultCollapsed />;
}
