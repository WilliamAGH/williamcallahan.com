"use client";

import { ExternalLink } from "@/components/ui/external-link.client";
import type { ProjectCardProps } from "@/types/features/projects";
import Image from "next/image";
import { buildCdnUrl, getCdnConfigFromEnv } from "@/lib/utils/cdn-utils";
import { type JSX, useState, useEffect } from "react";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { kebabCase } from "@/lib/utils/formatters";

// Placeholder for centered top image with gradient
function PlaceholderImageTop() {
  return (
    <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 rounded-md">
      {" "}
      {/* Added gradient */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Placeholder image"
        className="h-16 w-16 opacity-50" // Slightly larger and more subtle
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        role="img"
      >
        {" "}
        {/* Adjusted size */}
        <title>Placeholder image</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
    </div>
  );
}

export function ProjectCard({ project, isPriority = false }: ProjectCardProps): JSX.Element {
  const { name, description, url, imageKey, tags, techStack } = project;
  const initialImageUrl = imageKey ? buildCdnUrl(imageKey, getCdnConfigFromEnv()) : undefined;
  
  // Generate a URL-safe ID from the project name for anchor linking
  const projectId = kebabCase(name);

  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [hasError, setHasError] = useState(false);

  const placeholderUrl = getStaticImageUrl("/images/opengraph-placeholder.png");

  useEffect(() => {
    setImageUrl(initialImageUrl);
    setHasError(false);
  }, [initialImageUrl]);

  const handleImageError = () => {
    if (imageUrl !== placeholderUrl) {
      setHasError(true);
      setImageUrl(placeholderUrl);
    }
  };

  // Derive a technology stack from tags if explicit techStack is not provided
  const deriveTechFromTags = (tagList: string[] | undefined): string[] => {
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
    return tagList.filter((t) => TECH_KEYWORDS.has(t));
  };

  const displayTech = (techStack && techStack.length > 0 ? techStack : deriveTechFromTags(tags)).slice(0, 10);

  return (
    // Redesigned card for horizontal layout on medium screens and up
    <div 
      id={projectId || undefined}
      className="group rounded-lg border border-gray-300 dark:border-gray-900 overflow-hidden bg-white dark:bg-gray-800 transition-all duration-300 ease-in-out hover:shadow-lg hover:border-blue-500 dark:hover:border-blue-400 opacity-0 animate-fade-in-up md:flex h-auto flex-col md:flex-row">
      {" "}
      {/* Use h-auto for responsive height */}
      {/* Image Section (Left side on md+) */}
      <div className="md:w-2/5 relative aspect-[16/10] md:aspect-auto overflow-hidden flex-shrink-0 hover:scale-105 transition-transform duration-300 ease-in-out w-full">
        {" "}
        {/* Adjust width for responsiveness */}
        <ExternalLink
          href={url}
          title={`Visit ${name}'s website`}
          rawTitle={true} // Keep raw title for accessibility
          showIcon={false}
          className="block w-full h-full" // Removed relative from here
        >
          {imageUrl ? (
            <div className="relative w-full h-full">
              <Image
                src={imageUrl || placeholderUrl}
                alt={`${name} screenshot`}
                fill
                quality={hasError ? 70 : 80}
                priority={isPriority}
                sizes="(max-width: 767px) 100vw, (min-width: 768px) 50vw"
                placeholder="blur"
                blurDataURL={getStaticImageUrl("/images/opengraph-placeholder.png")}
                onError={handleImageError}
                className="object-cover w-full h-full transition-transform duration-300 ease-in-out group-hover:scale-105"
              />
            </div>
          ) : (
            <PlaceholderImageTop />
          )}
          {/* Removed Title Overlay */}
        </ExternalLink>
      </div>
      {/* Removed the div wrapper for the image */}
      {/* Content Section (Right side on md+) */}
      <div className="p-5 md:p-6 flex-1 w-full">
        {" "}
        {/* Use flex-1 to take remaining space */}
        <div className="flex flex-col h-full justify-between">
          {" "}
          {/* Allow content to space out vertically */}
          <div>
            {" "}
            {/* Top content group */}
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-2">
              {" "}
              {/* Justify between */}
              {/* Title */}
              <h3 className="text-xl font-mono font-semibold text-gray-800 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <ExternalLink
                  href={url}
                  title={`Visit ${name}'s website`}
                  showIcon={false}
                  className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {name}
                </ExternalLink>
              </h3>
              {/* Topic-Based Icon removed */}
            </div>
            {/* Code Snippet */}
            <pre className="bg-gray-800 text-green-400 p-2 rounded-md text-sm font-mono whitespace-pre-wrap">
              <code>{`// ${project.shortSummary}`}</code>
            </pre>
            {/* Description */}
            {description && (
              <p className="text-gray-400 leading-relaxed text-sm mt-1">
                {" "}
                {/* Adjusted text size/color */}
                {description}
              </p>
            )}
            {/* Tech Stack */}
            {displayTech.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  Tech Stack
                </div>
                <div className="flex flex-wrap gap-2">
                  {displayTech.map((tech) => (
                    <span
                      key={tech}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gradient-to-br from-gray-700/70 to-gray-800/60 border border-white/10 text-gray-200 shadow-sm"
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
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-700">
              {" "}
              {/* Added top border */}
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300" // Adjusted size/color
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
