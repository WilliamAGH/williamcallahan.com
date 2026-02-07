"use client";

import Link from "next/link";
import type { ProjectCardProps } from "@/types/features/projects";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";
import type { JSX } from "react";
import { OptimizedCardImage } from "@/components/ui/logo-image.client";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { GitHub } from "@/components/ui/social-icons/github-icon";
import { generateProjectSlug } from "@/lib/projects/slug-helpers";
import { safeExternalHref, isGitHubUrl } from "@/lib/utils/url-utils";
import {
  MAX_DISPLAY_TECH_ITEMS,
  deriveTechFromTags,
  PlaceholderImageTop,
} from "./project-card-helpers";

function resolveProjectCardImageUrl(
  imageKey: string | undefined,
  projectName: string,
): string | null {
  if (!imageKey) return null;

  try {
    return buildCdnUrl(imageKey, getCdnConfigFromEnv());
  } catch (error) {
    console.warn(`[ProjectCard] Failed to resolve image URL for "${projectName}".`, error);
    return null;
  }
}

export function ProjectCard({ project, preload = false }: ProjectCardProps): JSX.Element {
  const { name, description, url, imageKey, tags, techStack } = project;
  const cdnImageUrl = resolveProjectCardImageUrl(imageKey, name);

  // Generate slug for internal detail page link
  const projectSlug = generateProjectSlug(name, project.id);
  const detailPageUrl = `/projects/${projectSlug}`;

  // External project URL (GitHub, website, etc.)
  const externalUrl = safeExternalHref(url);
  const isGitHub = isGitHubUrl(url);
  const sanitizedGithubUrl = project.githubUrl ? safeExternalHref(project.githubUrl) : null;
  const shouldShowGithub = Boolean(sanitizedGithubUrl && sanitizedGithubUrl !== externalUrl);

  // Derive a technology stack from tags if explicit techStack is not provided

  const displayTech = (
    techStack && techStack.length > 0 ? techStack : deriveTechFromTags(tags)
  ).slice(0, MAX_DISPLAY_TECH_ITEMS);

  return (
    // Redesigned card for horizontal layout on medium screens and up
    <div
      id={projectSlug || undefined}
      tabIndex={projectSlug ? -1 : undefined}
      className="group rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900 transition-all duration-300 ease-in-out hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50 hover:border-blue-400/50 dark:hover:border-blue-500/50 opacity-0 animate-fade-in-up md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {/* Image Section (Left on desktop, top on mobile) */}
      <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 min-h-[140px] md:min-h-[180px]">
        <Link
          href={detailPageUrl}
          prefetch={false}
          title={`View ${name} details`}
          className="block w-full h-full"
        >
          {cdnImageUrl ? (
            <div className="relative w-full h-full min-h-[180px] md:min-h-[220px]">
              <OptimizedCardImage
                src={cdnImageUrl}
                alt={`${name} screenshot`}
                preload={preload}
                fit="contain"
                className="rounded-md transition-transform duration-300 ease-in-out group-hover:scale-[1.02]"
              />
            </div>
          ) : (
            <div className="w-full h-[180px]">
              <PlaceholderImageTop />
            </div>
          )}
        </Link>
      </div>
      {/* Content Section (Right on desktop, bottom on mobile) */}
      <div className="p-5 md:p-6 flex flex-col">
        <div className="flex flex-col h-full justify-between gap-4">
          {/* Top content group */}
          <div className="space-y-3">
            {/* Header with external link */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-xl font-mono font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                <Link
                  href={detailPageUrl}
                  prefetch={false}
                  title={`View ${name} details`}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {name}
                </Link>
              </h3>
              <div className="flex items-center gap-1">
                {shouldShowGithub && sanitizedGithubUrl && (
                  <a
                    href={sanitizedGithubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${name} source code on GitHub`}
                    title={`View ${name} source code on GitHub`}
                    className="flex-shrink-0 p-1.5 rounded-md transition-colors text-gray-500 hover:text-github dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GitHub className="w-5 h-5" />
                  </a>
                )}
                {externalUrl && (
                  <a
                    href={externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={isGitHub ? `View ${name} on GitHub` : `Visit ${name} website`}
                    title={isGitHub ? `View ${name} on GitHub` : `Visit ${name} website`}
                    className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                      isGitHub
                        ? "text-gray-500 hover:text-github dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                        : "text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isGitHub ? (
                      <GitHub className="w-5 h-5" />
                    ) : (
                      <ExternalLink className="w-5 h-5" />
                    )}
                  </a>
                )}
              </div>
            </div>
            {/* Code Snippet */}
            <pre className="bg-gray-900 dark:bg-gray-950 text-green-400 p-3 rounded-lg text-sm font-mono whitespace-pre-wrap leading-relaxed border border-gray-800">
              <code>{`// ${project.shortSummary}`}</code>
            </pre>
            {/* Description */}
            {description && (
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">
                {description}
              </p>
            )}
            {project.note && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-amber-900 text-sm shadow-sm dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500 dark:text-amber-300"
                  aria-hidden
                />
                <span>
                  <span className="font-semibold">Heads up:</span> {project.note}
                </span>
              </div>
            )}
            {/* Tech Stack */}
            {displayTech.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-2 font-medium">
                  Tech Stack
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {displayTech.map((tech) => (
                    <span
                      key={tech}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Tags (Bottom aligned) */}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-4 border-t border-gray-200 dark:border-gray-800">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
