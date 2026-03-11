/**
 * Static Content Index Loaders
 *
 * Index loaders for static content types: investments, experience, education, projects.
 * These use the loadOrBuildIndex pattern with persisted PostgreSQL artifacts.
 *
 * @module lib/search/loaders/static-content
 */

import MiniSearch from "minisearch";
import type { Investment } from "@/types/investment";
import type { Experience } from "@/types/schemas/experience";
import type { EducationItem, StaticSearchIndexArtifactDomain } from "@/types/schemas/search";
import type { IndexFieldConfig } from "@/types/search";
import type { Project } from "@/types/project";
import { investments } from "@/data/investments";
import { experiences } from "@/data/experience";
import { education, certifications } from "@/data/education";
import { projects as projectsData } from "@/data/projects";
import { getSerializedSearchIndexArtifact } from "@/lib/db/queries/search-index-artifacts";
import { envLogger } from "@/lib/utils/env-logger";
import { loadIndexFromJSON } from "../index-builder";
import { createIndex } from "../index-factory";
import {
  INVESTMENTS_INDEX_CONFIG,
  EXPERIENCE_INDEX_CONFIG,
  EDUCATION_INDEX_CONFIG,
  PROJECTS_INDEX_CONFIG,
} from "../config";
import { SEARCH_INDEX_KEYS, INDEX_TTL, USE_S3_INDEXES } from "../constants";

/**
 * Loads a search index from PostgreSQL if available, falls back to building in-memory.
 *
 * @template T - The document type being indexed
 * @param domain - Persisted search index artifact domain
 * @param cacheKey - Cache key for storing the loaded index
 * @param buildFn - Function to build the index if persisted load fails
 * @param ttl - Cache TTL for the index
 * @returns The MiniSearch index
 */
async function loadOrBuildIndex<T>(
  domain: StaticSearchIndexArtifactDomain,
  cacheKey: string,
  buildFn: () => MiniSearch<T>,
  _ttl: number,
  config?: IndexFieldConfig<T>,
): Promise<MiniSearch<T>> {
  let index: MiniSearch<T>;

  if (USE_S3_INDEXES) {
    try {
      const serializedIndex = await getSerializedSearchIndexArtifact(domain);
      if (serializedIndex?.index && serializedIndex.metadata) {
        index = loadIndexFromJSON<T>(serializedIndex, config);
        console.log(
          `[Search] Loaded ${cacheKey} from PostgreSQL (${serializedIndex.metadata.itemCount} items)`,
        );
      } else {
        envLogger.log(
          `Failed to load ${cacheKey} from PostgreSQL search artifacts, building in-memory`,
          undefined,
          {
            category: "Search",
          },
        );
        index = buildFn();
      }
    } catch (error) {
      console.error(`[Search] Error loading ${cacheKey} from PostgreSQL:`, error);
      index = buildFn();
    }
  } else {
    index = buildFn();
  }

  return index;
}

// --- Investments ---

function buildInvestmentsIndex(): MiniSearch<Investment> {
  return createIndex(INVESTMENTS_INDEX_CONFIG, investments, "Investments");
}

/**
 * Get or build the investments search index.
 * Loads from PostgreSQL if available, falls back to building in-memory.
 */
export async function getInvestmentsIndex(): Promise<MiniSearch<Investment>> {
  return loadOrBuildIndex(
    "investments",
    SEARCH_INDEX_KEYS.INVESTMENTS,
    buildInvestmentsIndex,
    INDEX_TTL.STATIC,
    INVESTMENTS_INDEX_CONFIG,
  );
}

/** Re-export investments data for use by searchers */
export { investments };

// --- Experience ---

function buildExperienceIndex(): MiniSearch<Experience> {
  return createIndex(EXPERIENCE_INDEX_CONFIG, experiences, "Experience");
}

/**
 * Get or build the experience search index.
 * Loads from PostgreSQL if available, falls back to building in-memory.
 */
export async function getExperienceIndex(): Promise<MiniSearch<Experience>> {
  return loadOrBuildIndex(
    "experience",
    SEARCH_INDEX_KEYS.EXPERIENCE,
    buildExperienceIndex,
    INDEX_TTL.STATIC,
    EXPERIENCE_INDEX_CONFIG,
  );
}

/** Re-export experiences data for use by searchers */
export { experiences };

// --- Education ---

/**
 * Transform raw education and certification data into EducationItem format.
 */
export function getEducationItems(): EducationItem[] {
  return [
    ...education.map((edu) => ({
      id: edu.id,
      label: edu.institution,
      description: edu.degree,
      path: `/education#${edu.id}`,
    })),
    ...certifications.map((cert) => ({
      id: cert.id,
      label: cert.institution,
      description: cert.name,
      path: `/education#${cert.id}`,
    })),
  ];
}

function buildEducationIndex(): MiniSearch<EducationItem> {
  const educationItems = getEducationItems();
  return createIndex(EDUCATION_INDEX_CONFIG, educationItems, "Education");
}

/**
 * Get or build the education search index.
 * Loads from PostgreSQL if available, falls back to building in-memory.
 */
export async function getEducationIndex(): Promise<MiniSearch<EducationItem>> {
  return loadOrBuildIndex(
    "education",
    SEARCH_INDEX_KEYS.EDUCATION,
    buildEducationIndex,
    INDEX_TTL.STATIC,
    EDUCATION_INDEX_CONFIG,
  );
}

// --- Projects ---

function buildProjectsIndex(): MiniSearch<Project> {
  return createIndex(PROJECTS_INDEX_CONFIG, projectsData, "Projects", (p) => p.name);
}

/**
 * Get or build the projects search index.
 * Loads from PostgreSQL if available, falls back to building in-memory.
 */
export async function getProjectsIndex(): Promise<MiniSearch<Project>> {
  return loadOrBuildIndex(
    "projects",
    SEARCH_INDEX_KEYS.PROJECTS,
    buildProjectsIndex,
    INDEX_TTL.STATIC,
    PROJECTS_INDEX_CONFIG,
  );
}

/** Re-export projects data for use by searchers */
export { projectsData };
