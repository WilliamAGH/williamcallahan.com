/**
 * Project Detail Component
 * @module components/features/projects/project-detail
 * @description
 * Displays full project details with screenshot, description, tech stack,
 * and tags. Follows the BookmarkDetail pattern for consistent UX.
 */

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import type { ProjectDetailProps } from "@/types/features/projects";
import {
  Globe,
  ExternalLink,
  ArrowUpRight,
  FolderKanban,
  ChevronLeft,
  AlertTriangle,
  Code2,
  Tag,
} from "lucide-react";
import { GitHub } from "@/components/ui/social-icons/github-icon";
import { safeExternalHref, getDisplayHostname } from "@/lib/utils/url-utils";
import { buildCdnUrl, getCdnConfigFromEnv, getOptimizedImageSrc } from "@/lib/utils/cdn-utils";
import { OptimizedCardImage } from "@/components/ui/logo-image.client";
import { RegistryLinks } from "@/components/ui/registry-links.client";
import { ProjectDetailAnalysis } from "./project-detail-analysis.server";
import { ProjectDetailImage } from "./project-detail-image.client";

/**
 * Check if URL is internal (starts with /)
 */
function isInternalUrl(url: string): boolean {
  return url.startsWith("/");
}

/**
 * SmartLink - Renders internal Next.js Link or external anchor based on URL type.
 * Centralizes the internal/external link logic to avoid duplication.
 */
function SmartLink({
  href,
  isInternal,
  className,
  children,
  ariaLabel,
}: {
  href: string;
  isInternal: boolean;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  if (isInternal) {
    return (
      <Link href={href} className={className} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}

export function ProjectDetail({ project }: ProjectDetailProps) {
  // Extract domain for display
  const domain = getDisplayHostname(project.url);

  // Check if URL is internal
  const isInternal = isInternalUrl(project.url);

  // Sanitize URL using the shared utility
  const safeUrl = isInternal ? project.url : safeExternalHref(project.url);

  // Transform imageKey (S3 path) to CDN URL for Next.js Image
  let imageUrl: string | undefined;
  if (project.imageKey) {
    try {
      const cdnUrl = buildCdnUrl(project.imageKey, getCdnConfigFromEnv());
      imageUrl = getOptimizedImageSrc(cdnUrl);
    } catch (error) {
      console.warn(`[ProjectDetail] Failed to resolve image URL for "${project.name}".`, error);
    }
  }

  return (
    <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Back Navigation */}
        <div className="mb-3 sm:mb-4">
          <Link
            href="/projects"
            className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 inline-flex items-center gap-1 transition-colors group"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors -ml-1" />
            <FolderKanban className="w-3.5 h-3.5" />
            <span>William&apos;s Projects</span>
          </Link>
        </div>

        {/* Header Section */}
        <div className="mb-6 sm:mb-8">
          {/* Title - Much larger for proper hierarchy */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-5 leading-tight">
            <SmartLink
              href={safeUrl ?? "/projects"}
              isInternal={isInternal}
              className="text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              {project.name}
            </SmartLink>
          </h1>

          {/* Short Summary as subtitle */}
          {project.shortSummary && (
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">{project.shortSummary}</p>
          )}

          {/* Clean Metadata Line */}
          <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
            {/* Domain with link */}
            <SmartLink
              href={safeUrl ?? "/projects"}
              isInternal={isInternal}
              className="inline-flex items-center gap-1.5 font-medium hover:text-gray-900 dark:hover:text-gray-100 transition-colors group"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{domain}</span>
              {!isInternal && (
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </SmartLink>
          </div>
        </div>

        {/* Main Content Grid - Mobile-first approach */}
        <div className="flex flex-col-reverse lg:grid lg:grid-cols-3 gap-6 lg:gap-10">
          {/* Main Content Column - Takes up 2/3 on large screens */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Featured Image - Full width at top of content */}
            {imageUrl && (
              <ProjectDetailImage>
                <div className="relative aspect-[16/10] sm:aspect-[16/9] w-full">
                  <OptimizedCardImage
                    src={imageUrl}
                    alt={`Screenshot of ${project.name}`}
                    preload
                    fit="contain"
                    className="!transition-none"
                  />
                  {/* Hover overlay */}
                  <SmartLink
                    href={safeUrl ?? "/projects"}
                    isInternal={isInternal}
                    className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center"
                    ariaLabel={
                      isInternal ? `View ${project.name}` : `View ${project.name} on ${domain}`
                    }
                  >
                    <div className="absolute top-4 right-4 p-2 bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                  </SmartLink>
                </div>
              </ProjectDetailImage>
            )}

            {/* Description Box */}
            {project.description && (
              <section className="p-4 sm:p-5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
                  About
                </h2>
                <div className="text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300">
                  <p>{project.description}</p>
                </div>
              </section>
            )}

            {/* Note/Disclaimer */}
            {project.note && (
              <section className="p-4 sm:p-5 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2 sm:mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Note
                </h2>
                <p className="text-sm sm:text-base leading-relaxed text-amber-900 dark:text-amber-100">
                  {project.note}
                </p>
              </section>
            )}

            {/* AI Analysis */}
            <Suspense fallback={null}>
              <ProjectDetailAnalysis project={project} />
            </Suspense>

            {/* If no content is available, show a placeholder */}
            {!project.description && !imageUrl && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <FolderKanban className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No additional details available for this project.</p>
                <p className="text-sm mt-2">Visit the project site to learn more.</p>
              </div>
            )}
          </div>

          {/* Sidebar Column - Shows first on mobile, 1/3 on large screens */}
          <div className="space-y-4 lg:space-y-6">
            {/* Tech Stack */}
            {project.techStack && project.techStack.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 sm:mb-3 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5" />
                  Tech Stack
                </h2>
                <div className="flex flex-wrap gap-2">
                  {project.techStack.map((tech) => (
                    <span
                      key={tech}
                      className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Tags */}
            {project.tags && project.tags.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2 sm:mb-3 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  Tags
                </h2>
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/projects?tag=${encodeURIComponent(tag)}`}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md text-xs transition-colors"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 sm:space-y-3">
              <SmartLink
                href={safeUrl ?? "/projects"}
                isInternal={isInternal}
                className="flex items-center justify-center gap-2 w-full px-5 py-3 sm:py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors group"
              >
                <span>{isInternal ? "View Content" : "Visit Project"}</span>
                <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </SmartLink>

              {project.githubUrl && project.githubUrl !== project.url && (
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-5 py-3 sm:py-2.5 bg-github text-white font-medium rounded-lg hover:bg-github/90 transition-colors"
                >
                  <GitHub className="w-4 h-4" />
                  <span>View Source</span>
                </a>
              )}

              {/* Registry Links (npm, PyPI, etc.) */}
              <RegistryLinks links={project.registryLinks} />

              <Link
                href="/projects"
                className="flex items-center justify-center gap-2 w-full px-5 py-3 sm:py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <FolderKanban className="w-4 h-4" />
                <span>All Projects</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
