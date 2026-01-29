/**
 * Static Content Index Loaders
 *
 * Index loaders for static content types: investments, experience, education, projects.
 * These use the loadOrBuildIndex pattern with S3 fallback.
 *
 * @module lib/search/loaders/static-content
 */

import MiniSearch from "minisearch";
import type { Investment } from "@/types/investment";
import type { Experience } from "@/types/experience";
import type { EducationItem, SerializedIndex } from "@/types/search";
import type { Project } from "@/types/project";
import { investments } from "@/data/investments";
import { experiences } from "@/data/experience";
import { education, certifications } from "@/data/education";
import { projects as projectsData } from "@/data/projects";
import { ServerCacheInstance } from "@/lib/server-cache";
import { SEARCH_S3_PATHS } from "@/lib/constants";
import { readJsonS3 } from "@/lib/s3-utils";
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
 * Loads a search index from S3 if available, falls back to building in-memory.
 *
 * @template T - The document type being indexed
 * @param s3Path - S3 path to the serialized index
 * @param cacheKey - Cache key for storing the loaded index
 * @param buildFn - Function to build the index if S3 load fails
 * @param ttl - Cache TTL for the index
 * @returns The MiniSearch index
 */
async function loadOrBuildIndex<T>(
  s3Path: string,
  cacheKey: string,
  buildFn: () => MiniSearch<T>,
  ttl: number,
): Promise<MiniSearch<T>> {
  // Try to get from cache first
  const cached = ServerCacheInstance.get<MiniSearch<T>>(cacheKey);
  if (cached) {
    return cached;
  }

  let index: MiniSearch<T>;

  if (USE_S3_INDEXES) {
    try {
      // Try to load from S3
      const serializedIndex = await readJsonS3<SerializedIndex>(s3Path);
      if (serializedIndex?.index && serializedIndex.metadata) {
        index = loadIndexFromJSON<T>(serializedIndex);
        console.log(
          `[Search] Loaded ${cacheKey} from S3 (${serializedIndex.metadata.itemCount} items)`,
        );
      } else {
        // Fall back to building in-memory
        envLogger.log(`Failed to load ${cacheKey} from S3, building in-memory`, undefined, {
          category: "Search",
        });
        index = buildFn();
      }
    } catch (error) {
      console.error(`[Search] Error loading ${cacheKey} from S3:`, error);
      // Fall back to building in-memory
      index = buildFn();
    }
  } else {
    // Build in-memory
    index = buildFn();
  }

  // Cache the index
  ServerCacheInstance.set(cacheKey, index, ttl);
  return index;
}

// --- Investments ---

function buildInvestmentsIndex(): MiniSearch<Investment> {
  return createIndex(INVESTMENTS_INDEX_CONFIG, investments, "Investments");
}

/**
 * Get or build the investments search index.
 * Loads from S3 if available, falls back to building in-memory.
 */
export async function getInvestmentsIndex(): Promise<MiniSearch<Investment>> {
  return loadOrBuildIndex(
    SEARCH_S3_PATHS.INVESTMENTS_INDEX,
    SEARCH_INDEX_KEYS.INVESTMENTS,
    buildInvestmentsIndex,
    INDEX_TTL.STATIC,
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
 * Loads from S3 if available, falls back to building in-memory.
 */
export async function getExperienceIndex(): Promise<MiniSearch<Experience>> {
  return loadOrBuildIndex(
    SEARCH_S3_PATHS.EXPERIENCE_INDEX,
    SEARCH_INDEX_KEYS.EXPERIENCE,
    buildExperienceIndex,
    INDEX_TTL.STATIC,
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
 * Loads from S3 if available, falls back to building in-memory.
 */
export async function getEducationIndex(): Promise<MiniSearch<EducationItem>> {
  return loadOrBuildIndex(
    SEARCH_S3_PATHS.EDUCATION_INDEX,
    SEARCH_INDEX_KEYS.EDUCATION,
    buildEducationIndex,
    INDEX_TTL.STATIC,
  );
}

// --- Projects ---

function buildProjectsIndex(): MiniSearch<Project> {
  return createIndex(PROJECTS_INDEX_CONFIG, projectsData, "Projects", (p) => p.name);
}

/**
 * Get or build the projects search index.
 * Loads from S3 if available, falls back to building in-memory.
 */
export async function getProjectsIndex(): Promise<MiniSearch<Project>> {
  return loadOrBuildIndex(
    SEARCH_S3_PATHS.PROJECTS_INDEX,
    SEARCH_INDEX_KEYS.PROJECTS,
    buildProjectsIndex,
    INDEX_TTL.STATIC,
  );
}

/** Re-export projects data for use by searchers */
export { projectsData };
