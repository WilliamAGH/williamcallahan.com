/**
 * CV Content Extraction
 * @module lib/cv/cv-data
 * @description
 * Provides shared curriculum vitae data structures and derived view models used by
 * both the web route and PDF renderer. Consolidating this logic keeps the `/cv`
 * page below the 500 line limit while guaranteeing the PDF presentation stays in
 * lockstep with the on-page experience.
 */

import { experiences } from "@/data/experience";
import { certifications, education, recentCourses } from "@/data/education";
import { metadata as siteMetadata } from "@/data/metadata";
import { projects } from "@/data/projects";
import {
  CV_CONTACT_LINKS,
  CV_LAST_UPDATED_DATE,
  CV_PROFESSIONAL_SUMMARY,
  CV_QUALIFICATIONS,
  CV_TECHNICAL_FOCUS,
} from "@/data/cv";
import type {
  CvCertificationEntry,
  CvCourseGroup,
  CvCourseSummary,
  CvData,
  CvDegreeEntry,
  CvExperienceEntry,
  CvProjectEntry,
} from "@/types/cv";
import { validateExperienceArray } from "@/types/experience";
import {
  validateCertificationArray,
  validateClassArray,
  validateEducationArray,
} from "@/types/education";
import { stripWwwPrefix } from "@/lib/utils/url-utils";

const validatedExperiences = validateExperienceArray(experiences);
const validatedProjects = projects;
const validatedEducationEntries = validateEducationArray(education);
const validatedCertifications = validateCertificationArray(certifications);
const validatedRecentCourses = validateClassArray(recentCourses);

const parseExperienceRole = (role: string) => {
  const [headlineRaw = "", ...rest] = role.split(" - ");
  const headline = headlineRaw.trim();

  if (rest.length === 0) {
    return { headline, summary: "", bullets: [] as string[] };
  }

  const summary = rest.join(" - ").trim();
  const bullets = summary
    .split(/\.\s+/)
    .map((item) => item.trim().replace(/\.$/, ""))
    .filter(Boolean);

  return { headline, summary, bullets };
};

const toDisplayHost = (href?: string | null) => {
  if (!href) {
    return null;
  }

  try {
    const hostname = stripWwwPrefix(new URL(href).hostname);
    return hostname || href;
  } catch {
    return href;
  }
};

const toDisplayUrl = (href?: string | null) => {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href);
    const host = stripWwwPrefix(url.hostname);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${host}${path}`;
  } catch {
    return href;
  }
};

const buildExperienceEntries = (): readonly CvExperienceEntry[] =>
  validatedExperiences
    .filter((experienceItem) => experienceItem.cvFeatured)
    .map((experienceItem): CvExperienceEntry => {
      const parsed = parseExperienceRole(experienceItem.role);

      return {
        id: experienceItem.id,
        company: experienceItem.company,
        period: experienceItem.period,
        location: experienceItem.location,
        website: experienceItem.website ?? null,
        displayWebsite: toDisplayHost(experienceItem.website),
        role: experienceItem.role,
        headline: parsed.headline,
        summary: parsed.summary,
        bullets: parsed.bullets,
      };
    });

const buildProjectEntries = (): readonly CvProjectEntry[] =>
  validatedProjects
    .filter((project) => project.cvFeatured)
    .map(
      (project): CvProjectEntry => ({
        id: project.id ?? project.name,
        name: project.name,
        description: project.description,
        url: project.url,
        tags: (project.tags ?? []).slice(0, 6),
      }),
    );

const buildDegreeEntries = (): readonly CvDegreeEntry[] =>
  validatedEducationEntries
    .filter((degree) => degree.cvFeatured)
    .map(
      (degree): CvDegreeEntry => ({
        id: degree.id,
        institution: degree.institution,
        degree: degree.degree,
        location: degree.location,
        year: String(degree.year),
      }),
    );

const buildCertificationEntries = (): readonly CvCertificationEntry[] =>
  validatedCertifications
    .filter((certificationItem) => certificationItem.cvFeatured)
    .map(
      (certificationItem): CvCertificationEntry => ({
        id: certificationItem.id,
        name: certificationItem.name,
        institution: certificationItem.institution,
        year: String(certificationItem.year),
        location: certificationItem.location,
      }),
    );

const buildCourseGroups = (): readonly CvCourseGroup[] => {
  const featuredCourses = validatedRecentCourses.filter((course) => course.cvFeatured);
  const coursesByInstitution = featuredCourses.reduce<Map<string, CvCourseSummary[]>>(
    (acc, course) => {
      const current = acc.get(course.institution) ?? [];
      current.push({ id: course.id, name: course.name, year: String(course.year) });
      acc.set(course.institution, current);
      return acc;
    },
    new Map(),
  );

  return Array.from(coursesByInstitution.entries()).map(
    ([institution, courseList]): CvCourseGroup => ({
      institution,
      courses: courseList,
    }),
  );
};

export const getCvData = (): CvData => {
  const siteUrl = siteMetadata.site?.url ?? "https://williamcallahan.com";
  const personalSiteHost = toDisplayHost(siteUrl) ?? "williamcallahan.com";
  const aventureHost = toDisplayHost(CV_CONTACT_LINKS.aventureUrl) ?? "aventure.vc";
  const linkedInLabel =
    toDisplayUrl(CV_CONTACT_LINKS.linkedInUrl) ?? "linkedin.com/in/williamacallahan";

  // Use build-time constant to avoid DYNAMIC_SERVER_USAGE errors in cached components
  const lastUpdatedDisplay = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(CV_LAST_UPDATED_DATE);

  return {
    professionalSummary: CV_PROFESSIONAL_SUMMARY,
    qualifications: CV_QUALIFICATIONS,
    technicalFocus: CV_TECHNICAL_FOCUS,
    experiences: buildExperienceEntries(),
    projects: buildProjectEntries(),
    degrees: buildDegreeEntries(),
    certifications: buildCertificationEntries(),
    groupedCourses: buildCourseGroups(),
    siteUrl,
    personalSiteHost,
    aventureUrl: CV_CONTACT_LINKS.aventureUrl,
    aventureHost,
    twitterUrl: CV_CONTACT_LINKS.twitterUrl,
    twitterHandle: CV_CONTACT_LINKS.twitterHandle,
    linkedInUrl: CV_CONTACT_LINKS.linkedInUrl,
    linkedInLabel,
    lastUpdatedDisplay,
  } satisfies CvData;
};

export type { CvContent, CvData } from "@/types/cv";
