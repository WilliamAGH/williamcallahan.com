"use client";

import { ExternalLink } from "@/components/ui/external-link.client";
import type { ProjectCardProps } from "@/types/features/projects";
import Image from "next/image";
import { buildCdnUrl, buildCachedImageUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";
import { type JSX, useState, useEffect } from "react";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { kebabCase } from "@/lib/utils/formatters";
import { AlertTriangle } from "lucide-react";

const MAX_DISPLAY_TECH_ITEMS = 10;

// Hoisted helper to satisfy consistent-function-scoping
function deriveTechFromTags(tagList: string[] | undefined): string[] {
  if (!tagList || tagList.length === 0) return [];
  const TECH_KEYWORDS = new Set([
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "React",
    "MDX",
    "Server Components",
    "Java",
    "Spring Boot",
    "Spring AI",
    "OpenAI",
    "Google Books API",
    "Thymeleaf",
    "HTMX",
    "PostgreSQL",
    "Docker",
    "Groq",
    "Gemini",
  ]);
  return tagList.filter(t => TECH_KEYWORDS.has(t));
}

// Placeholder for centered top image with gradient
function PlaceholderImageTop() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center text-gray-400 dark:text-gray-500">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Placeholder image"
        className="h-12 w-12 opacity-40"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        role="img"
      >
        <title>Placeholder image</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

export function ProjectCard({ project, preload = false }: ProjectCardProps): JSX.Element {
  const { name, description, url, imageKey, tags, techStack } = project;
  const initialImageUrl = imageKey ? buildCdnUrl(imageKey, getCdnConfigFromEnv()) : undefined;
  const initialProxiedUrl = initialImageUrl ? buildCachedImageUrl(initialImageUrl) : undefined;

  // Generate a URL-safe ID from the project name for anchor linking
  const projectId = kebabCase(name);

  const [imageUrl, setImageUrl] = useState(initialProxiedUrl);
  const [hasError, setHasError] = useState(false);

  const placeholderUrl = getStaticImageUrl("/images/opengraph-placeholder.png");

  useEffect(() => {
    setImageUrl(initialProxiedUrl);
    setHasError(false);
  }, [initialProxiedUrl]);

  const handleImageError = () => {
    if (imageUrl !== placeholderUrl) {
      setHasError(true);
      setImageUrl(placeholderUrl);
    }
  };

  // Derive a technology stack from tags if explicit techStack is not provided

  const displayTech = (techStack && techStack.length > 0 ? techStack : deriveTechFromTags(tags)).slice(
    0,
    MAX_DISPLAY_TECH_ITEMS,
  );

  return (
    // Redesigned card for horizontal layout on medium screens and up
    <div
      id={projectId || undefined}
      tabIndex={projectId ? -1 : undefined}
      className="group rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden bg-white dark:bg-gray-900 transition-all duration-300 ease-in-out hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50 hover:border-blue-400/50 dark:hover:border-blue-500/50 opacity-0 animate-fade-in-up md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] flex flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {/* Image Section (Left on desktop, top on mobile) */}
      <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center min-h-[140px] md:min-h-[180px]">
        <ExternalLink
          href={url}
          title={`Visit ${name}'s website`}
          rawTitle={true}
          showIcon={false}
          className="block w-full h-full"
        >
          {imageUrl ? (
            <div className="relative w-full h-full flex items-center justify-center p-3 md:p-4">
              <Image
                src={imageUrl || placeholderUrl}
                alt={`${name} screenshot`}
                width={600}
                height={400}
                quality={hasError ? 70 : 85}
                preload={preload}
                sizes="(max-width: 767px) 100vw, (min-width: 768px) 50vw"
                placeholder="blur"
                blurDataURL={getStaticImageUrl("/images/opengraph-placeholder.png")}
                onError={handleImageError}
                className="w-full h-auto max-h-[280px] md:max-h-[320px] object-contain rounded-md transition-transform duration-300 ease-in-out group-hover:scale-[1.02]"
                unoptimized
              />
            </div>
          ) : (
            <div className="w-full h-[180px]">
              <PlaceholderImageTop />
            </div>
          )}
        </ExternalLink>
      </div>
      {/* Content Section (Right on desktop, bottom on mobile) */}
      <div className="p-5 md:p-6 flex flex-col">
        <div className="flex flex-col h-full justify-between gap-4">
          {/* Top content group */}
          <div className="space-y-3">
            {/* Header */}
            <h3 className="text-xl font-mono font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              <ExternalLink
                href={url}
                title={`Visit ${name}'s website`}
                showIcon={false}
                className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {name}
              </ExternalLink>
            </h3>
            {/* Code Snippet */}
            <pre className="bg-gray-900 dark:bg-gray-950 text-green-400 p-3 rounded-lg text-sm font-mono whitespace-pre-wrap leading-relaxed border border-gray-800">
              <code>{`// ${project.shortSummary}`}</code>
            </pre>
            {/* Description */}
            {description && <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">{description}</p>}
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
                  {displayTech.map(tech => (
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
              {tags.map(tag => (
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
