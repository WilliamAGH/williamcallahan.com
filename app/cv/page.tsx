/**
 * CV Page Route
 * @module app/cv/page
 * @description
 * Server-rendered curriculum vitae that reuses existing data sources across experience,
 * education, certifications, and projects while presenting a condensed printable layout.
 * Contact details reuse shared social icon assets (e.g., the canonical X icon) to avoid
 * duplicating SVG definitions and keep brand styling consistent.
 */

// TODO: Add a special generative AI component that allows the user to generate a CV based on my real experience on the topics they're most interested in
// For trust, point out that the AI has been trained on my real experience and data, and has instructions to only use my real experience and data.

import Link from "next/link";
import type { Metadata } from "next";
import { FileText, Globe, Linkedin, Loader2, MapPin } from "lucide-react";
import { PAGE_METADATA, OG_IMAGE_DIMENSIONS } from "@/data/metadata";
import { JsonLdScript } from "@/components/seo/json-ld";
import CvPdfDownloadButtonEnhancer from "@/components/features/cv/CvPdfDownloadButton";
import { X } from "@/components/ui/social-icons";
import { getCvData } from "@/lib/cv/cv-data";
import { getStaticPageMetadata } from "@/lib/seo";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { formatSeoDate } from "@/lib/seo/utils";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { cn } from "@/lib/utils";
import { headers } from "next/headers";

const CV_PAGE_PATH = "/cv" as const;
const CV_PDF_DOWNLOAD_ENDPOINT = "/api/cv/pdf" as const;
const CV_PDF_BUTTON_ID = "cv-pdf-download-button" as const;

export const metadata: Metadata = getStaticPageMetadata(CV_PAGE_PATH, "cv");

/**
 * Curriculum vitae route rendering highlighted professional history and credentials.
 * Surfaces highlighted technical projects immediately after qualifications to balance
 * modern software work with prior finance leadership experience.
 * Contact metadata renders in explicit rows so the location and primary websites always
 * start on their own line, preserving parity with the PDF export.
 */
export default async function CvPage(): Promise<React.JSX.Element> {
  // Access headers to opt out of static rendering for dynamic date
  // This allows getCvData() to use new Date() safely
  // Only call headers() in non-test environments as it requires request context
  if (typeof jest === "undefined") {
    await headers();
  }

  const pageMetadata = PAGE_METADATA.cv;
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const imageDimensions = OG_IMAGE_DIMENSIONS["legacy"];

  const schemaParams = {
    path: CV_PAGE_PATH,
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "profile" as const,
    image: {
      url: getStaticImageUrl("/images/og/experience-og.png"),
      width: imageDimensions.width,
      height: imageDimensions.height,
    },
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: CV_PAGE_PATH, name: "Curriculum Vitae" },
    ],
    profileMetadata: {
      bio: pageMetadata.bio,
      alternateName: pageMetadata.alternateName,
      profileImage: pageMetadata.profileImage,
      interactionStats: pageMetadata.interactionStats,
    },
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  const pdfButtonLabel = "Download CV as PDF" as const;
  const pdfButtonClassName = cn(
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 transition-colors hover:bg-zinc-900 hover:text-white dark:border-zinc-700 dark:text-zinc-300",
    "disabled:cursor-not-allowed disabled:opacity-70",
  );

  const {
    professionalSummary,
    qualifications,
    technicalFocus,
    experiences,
    projects,
    degrees,
    certifications,
    groupedCourses,
    siteUrl,
    personalSiteHost,
    aventureUrl,
    aventureHost,
    twitterUrl,
    twitterHandle,
    linkedInUrl,
    linkedInLabel,
    lastUpdatedDisplay,
  } = getCvData();

  // Temporary: hide Qualifications section during iteration
  const showQualifications: boolean = false;

  // Build a flattened list of coursework with issuer shown as muted metadata
  const courseItems: { id: string; name: string; year: string; institution: string }[] = groupedCourses
    .flatMap(group => group.courses.map(course => ({ ...course, institution: group.institution })))
    .toSorted((a, b) => Number(b.year) - Number(a.year));

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="mx-auto w-full max-w-3xl px-6 py-6 sm:px-8 md:py-8 font-mono text-[0.95rem] leading-7 text-zinc-800 dark:text-zinc-100">
        <header className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                William Callahan
              </h1>
              <p className="mt-2 text-xs uppercase tracking-[0.35em] text-zinc-500 dark:text-zinc-400">
                CFA Charterholder · CFP® Professional
              </p>
            </div>
            <div className="self-start sm:self-auto flex flex-col items-center gap-0.5">
              <a
                id={CV_PDF_BUTTON_ID}
                href={CV_PDF_DOWNLOAD_ENDPOINT}
                className={pdfButtonClassName}
                aria-label={pdfButtonLabel}
                data-loading="false"
              >
                <Loader2 className="h-4 w-4 animate-spin hidden data-[loading=true]:block" aria-hidden="true" />
                <FileText className="h-4 w-4 data-[loading=true]:hidden" aria-hidden="true" />
                <span className="sr-only">{pdfButtonLabel}</span>
              </a>
              <CvPdfDownloadButtonEnhancer targetId={CV_PDF_BUTTON_ID} />
              <span
                aria-hidden="true"
                className="leading-none text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500 dark:text-zinc-400"
              >
                PDF
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                <span>San Francisco, California</span>
              </span>
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" aria-hidden="true" />
                <Link
                  href={siteUrl}
                  className="transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  {personalSiteHost}
                </Link>
              </span>
              <span className="flex items-center gap-2">
                <Globe className="h-4 w-4" aria-hidden="true" />
                <Link
                  href={aventureUrl}
                  className="transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  {aventureHost}
                </Link>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="flex items-center gap-2">
                <X className="h-4 w-4" aria-hidden="true" />
                <Link
                  href={twitterUrl}
                  className="transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  {twitterHandle}
                </Link>
              </span>
              <span className="flex items-center gap-2">
                <Linkedin className="h-4 w-4" aria-hidden="true" />
                <Link
                  href={linkedInUrl}
                  className="transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  {linkedInLabel}
                </Link>
              </span>
            </div>
          </div>
        </header>

        <hr className="my-8 border-zinc-300 dark:border-zinc-700" />

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
            Professional Summary
          </h2>
          <p className="mt-4 leading-7 text-zinc-700 dark:text-zinc-200">{professionalSummary}</p>
        </section>

        {showQualifications ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
              Distinguished Qualifications
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {qualifications.map(item => (
                <article
                  key={item.id}
                  className={`rounded-md border border-zinc-300 bg-white/40 p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition-colors dark:border-zinc-700 dark:bg-zinc-900/20 ${
                    item.id === "dual" ? "sm:col-span-2" : ""
                  }`}
                >
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.title}</p>
                  <div className="mt-3 space-y-1 text-xs uppercase tracking-[0.25em] text-zinc-500 dark:text-zinc-400">
                    {item.meta.map((line: string) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {projects.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
              Highlighted Technical Projects
            </h2>
            <div className="mt-5 space-y-6">
              {projects.map(project => (
                <article key={project.id} className="space-y-3 border-l border-zinc-300 pl-4 dark:border-zinc-700">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{project.name}</h3>
                    {project.url ? (
                      <Link
                        href={project.url}
                        className="text-xs uppercase tracking-[0.25em] text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        View
                      </Link>
                    ) : null}
                  </div>
                  {project.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
                      {project.tags.map(tag => (
                        <span
                          key={`${project.id}-${tag}`}
                          className="rounded-sm border border-zinc-300 px-2 py-[2px] dark:border-zinc-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{project.description}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {experiences.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
              Professional Experience
            </h2>
            <ul className="mt-5 space-y-6">
              {experiences.map(experienceItem => (
                <li key={experienceItem.id} className="space-y-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {experienceItem.company}
                    </span>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">{experienceItem.period}</span>
                  </div>
                  <div className="space-y-1 text-sm text-zinc-500 dark:text-zinc-400">
                    <span className="block">{experienceItem.headline}</span>
                    {experienceItem.location || (experienceItem.displayWebsite && experienceItem.website) ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {experienceItem.location ? (
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-500">
                              ·
                            </span>
                            <span>{experienceItem.location}</span>
                          </span>
                        ) : null}
                        {experienceItem.displayWebsite && experienceItem.website ? (
                          <span className="flex items-center gap-2">
                            <span aria-hidden="true" className="text-zinc-400 dark:text-zinc-500">
                              ·
                            </span>
                            <Link
                              href={experienceItem.website}
                              className="text-zinc-500 underline decoration-dotted underline-offset-4 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                              rel="noreferrer noopener"
                              target="_blank"
                            >
                              {experienceItem.displayWebsite}
                            </Link>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {experienceItem.bullets.length > 0 ? (
                    <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {experienceItem.bullets.map(bullet => (
                        <li
                          key={`${experienceItem.id}-${bullet}`}
                          className="flex gap-2 before:content-['•'] before:text-zinc-400 before:leading-6"
                        >
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  ) : experienceItem.summary ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">{experienceItem.summary}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {degrees.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
              Education
            </h2>
            <ul className="mt-5 space-y-4">
              {degrees.map(degree => (
                <li key={degree.id} className="space-y-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{degree.institution}</span>
                    <span className="text-xs uppercase tracking-[0.25em] text-zinc-500 dark:text-zinc-400">
                      {degree.year}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300">{degree.degree}</p>
                  <p className="text-xs uppercase tracking-[0.25em] text-zinc-500 dark:text-zinc-400">
                    {degree.location}
                  </p>
                </li>
              ))}
            </ul>

            {courseItems.length > 0 ? (
              <div className="mt-8 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
                  Selected Programming Coursework
                </h3>
                <ul className="space-y-2">
                  {courseItems.map(item => (
                    <li key={item.id} className="rounded-md border border-zinc-300 p-3 dark:border-zinc-700">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.name}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.year}</span>
                      </div>
                      <div className="mt-1 text-[0.65rem] uppercase tracking-[0.25em] text-zinc-500 dark:text-zinc-400">
                        {item.institution}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {certifications.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
              Certifications & Professional Development
            </h2>
            <ul className="mt-5 space-y-3">
              {certifications.map(certificationItem => (
                <li key={certificationItem.id} className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{certificationItem.name}</p>
                  <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.25em] text-zinc-500 dark:text-zinc-400">
                    <span>{certificationItem.institution}</span>
                    <span>• {certificationItem.year}</span>
                    <span>• {certificationItem.location}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">
            Technical Focus
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {technicalFocus.map(section => (
              <article key={section.id} className="space-y-2 border border-zinc-300 p-4 dark:border-zinc-700">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{section.title}</h3>
                <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {section.bullets.map(item => (
                    <li key={item} className="flex gap-2 before:content-['•'] before:text-zinc-400 before:leading-6">
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-zinc-300 pt-6 text-xs uppercase tracking-[0.3em] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          <p>Last updated: {lastUpdatedDisplay}</p>
        </footer>
      </div>
    </>
  );
}
