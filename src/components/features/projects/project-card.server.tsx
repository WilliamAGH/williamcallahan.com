import { ExternalLink } from "@/components/ui/external-link.client";
import type { ProjectCardServerProps } from "@/types/features/projects";
import Image from "next/image";
import { type JSX } from "react";
import {
  buildCdnUrl,
  getCdnConfigFromEnv,
  getOptimizedImageSrc,
  shouldBypassOptimizer,
} from "@/lib/utils/cdn-utils";
import {
  MAX_DISPLAY_TECH_ITEMS,
  deriveTechFromTags,
  PlaceholderImageTop,
} from "./project-card-helpers";

export function ProjectCardServer({ project }: ProjectCardServerProps): JSX.Element {
  const { name, description, url, imageKey, tags, techStack } = project;
  const cdnImageUrl = imageKey ? buildCdnUrl(imageKey, getCdnConfigFromEnv()) : undefined;
  const imageUrl = getOptimizedImageSrc(cdnImageUrl);

  // Derive a technology stack from tags if explicit techStack is not provided
  const displayTech = (
    techStack && techStack.length > 0 ? techStack : deriveTechFromTags(tags)
  ).slice(0, MAX_DISPLAY_TECH_ITEMS);

  return (
    // Redesigned card for horizontal layout on medium screens and up
    <div className="group rounded-lg border border-gray-300 dark:border-gray-900 overflow-hidden bg-white dark:bg-gray-800 transition-all duration-300 ease-in-out hover:shadow-lg hover:border-blue-500 dark:hover:border-blue-400 opacity-0 animate-fade-in-up md:flex h-auto flex-col md:flex-row">
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
          className="block w-full h-full" // Ensure link covers the area
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={`${name} screenshot`}
              fill
              quality={80}
              sizes="(max-width: 767px) 100vw, (min-width: 768px) 50vw" // Adjusted sizes for both mobile and desktop
              placeholder="blur"
              blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFdwI2QJIiBQAAAABJRU5ErkJggg=="
              // Subtle zoom on hover
              className="object-cover w-full h-full transition-transform duration-300 ease-in-out group-hover:scale-105" // Ensure object-cover for aspect ratio
              {...(shouldBypassOptimizer(imageUrl) ? { unoptimized: true } : {})}
            />
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
