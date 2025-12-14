/**
 * CV Types
 * @module types/cv
 * @description
 * Shared TypeScript interfaces describing curriculum vitae presentation data.
 * These types are consumed by both the `/cv` route and supporting PDF utilities
 * to guarantee consistent structure across render targets.
 */

export interface CvQualification {
  id: string;
  title: string;
  meta: readonly string[];
}

export interface CvTechnicalFocusSection {
  id: string;
  title: string;
  bullets: readonly string[];
}

export interface CvExperienceEntry {
  id: string;
  company: string;
  period: string;
  location?: string;
  website?: string | null;
  displayWebsite?: string | null;
  role: string;
  headline: string;
  summary: string;
  bullets: string[];
}

export interface CvProjectEntry {
  id: string;
  name: string;
  description: string;
  url?: string;
  tags: string[];
}

export interface CvCourseSummary {
  id: string;
  name: string;
  year: string;
}

export interface CvCourseGroup {
  institution: string;
  courses: readonly CvCourseSummary[];
}

export interface CvDegreeEntry {
  id: string;
  institution: string;
  degree: string;
  location: string;
  year: string;
}

export interface CvCertificationEntry {
  id: string;
  name: string;
  institution: string;
  year: string;
  location: string;
}

export interface CvContactLinks {
  aventureUrl: string;
  twitterUrl: string;
  twitterHandle: string;
  linkedInUrl: string;
}

export interface CvData {
  professionalSummary: string;
  qualifications: readonly CvQualification[];
  technicalFocus: readonly CvTechnicalFocusSection[];
  experiences: readonly CvExperienceEntry[];
  projects: readonly CvProjectEntry[];
  degrees: readonly CvDegreeEntry[];
  certifications: readonly CvCertificationEntry[];
  groupedCourses: readonly CvCourseGroup[];
  siteUrl: string;
  personalSiteHost: string;
  aventureUrl: string;
  aventureHost: string;
  twitterUrl: string;
  twitterHandle: string;
  linkedInUrl: string;
  linkedInLabel: string;
  lastUpdatedDisplay: string;
}

export type CvContent = CvData;
