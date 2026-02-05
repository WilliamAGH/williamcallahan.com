/**
 * RAG Inventory Static Sections
 *
 * Builds inventory sections from repo-local datasets and MDX blog metadata.
 *
 * @module lib/ai/rag/inventory-static
 */

import "server-only";

import { investments } from "@/data/investments";
import { projects } from "@/data/projects";
import { experiences } from "@/data/experience";
import { education, certifications, recentCourses } from "@/data/education";
import { getAllMDXPostsForSearch } from "@/lib/blog/mdx";
import { envLogger } from "@/lib/utils/env-logger";
import type { BlogPost } from "@/types/blog";
import type {
  InventoryPaginationConfig,
  InventoryPaginationMeta,
  InventorySectionBuildResult,
  InventorySectionName,
} from "@/types/rag";
import { buildPaginatedSectionLines, buildSectionLines, formatLine } from "./inventory-format";
import { calculatePaginationMeta, DEFAULT_PAGE_SIZE, paginateRows } from "./inventory-pagination";

const buildBlogRows = (posts: BlogPost[]): string[] =>
  posts
    .toSorted((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .map((post) =>
      formatLine({
        slug: post.slug,
        title: post.title,
        publishedAt: post.publishedAt,
        tags: post.tags,
        url: `/blog/${post.slug}`,
      }),
    );

/** Investment section fields */
const INVESTMENT_FIELDS = [
  "id",
  "name",
  "type",
  "stage",
  "status",
  "operating_status",
  "invested_year",
  "founded_year",
  "acquired_year",
  "shutdown_year",
  "category",
  "location",
  "url",
  "website",
  "aventure_url",
] as const;

/** Build formatted rows for investments (sorted by name) */
export const buildInvestmentRows = (): string[] =>
  investments
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map((inv) =>
      formatLine({
        id: inv.id,
        name: inv.name,
        type: inv.type,
        stage: inv.stage,
        status: inv.status,
        operating_status: inv.operating_status,
        invested_year: inv.invested_year,
        founded_year: inv.founded_year,
        acquired_year: inv.acquired_year,
        shutdown_year: inv.shutdown_year,
        category: inv.category,
        location: inv.location,
        url: `/investments#${inv.id}`,
        website: inv.website,
        aventure_url: inv.aventure_url,
      }),
    );

/**
 * Build a paginated investments section.
 */
export function buildPaginatedInvestmentsSection(pagination: InventoryPaginationConfig): {
  section: InventorySectionBuildResult;
  meta: InventoryPaginationMeta;
} {
  const allRows = buildInvestmentRows();
  const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = pagination.page ?? 1;

  const meta = calculatePaginationMeta("investments", allRows.length, page, pageSize);
  const pageRows = paginateRows(allRows, page, pageSize);

  const section = buildPaginatedSectionLines({
    name: "investments",
    fields: [...INVESTMENT_FIELDS],
    allRows: pageRows,
    pagination: meta,
    status: "success",
  });

  return { section, meta };
}

export async function buildStaticInventorySections(): Promise<{
  sections: InventorySectionBuildResult[];
  failedSections: InventorySectionName[];
  blogPosts: BlogPost[];
}> {
  const sections: InventorySectionBuildResult[] = [];
  const failedSections: InventorySectionName[] = [];

  sections.push(
    buildSectionLines({
      name: "investments",
      fields: [...INVESTMENT_FIELDS],
      rows: buildInvestmentRows(),
      status: "success",
    }),
  );

  sections.push(
    buildSectionLines({
      name: "projects",
      fields: ["id", "name", "url", "githubUrl", "tags", "cvFeatured"],
      rows: projects
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((project) =>
          formatLine({
            id: project.id,
            name: project.name,
            url: project.url ?? "/projects",
            githubUrl: project.githubUrl,
            tags: project.tags,
            cvFeatured: project.cvFeatured,
          }),
        ),
      status: "success",
    }),
  );

  sections.push(
    buildSectionLines({
      name: "experience",
      fields: ["id", "company", "role", "period", "startDate", "endDate", "location", "url"],
      rows: experiences
        .toSorted((a, b) => a.company.localeCompare(b.company))
        .map((exp) =>
          formatLine({
            id: exp.id,
            company: exp.company,
            role: exp.role,
            period: exp.period,
            startDate: exp.startDate,
            endDate: exp.endDate,
            location: exp.location,
            url: `/experience#${exp.id}`,
          }),
        ),
      status: "success",
    }),
  );

  sections.push(
    buildSectionLines({
      name: "education",
      fields: ["id", "institution", "degree", "year", "location", "url", "cvFeatured"],
      rows: education
        .toSorted((a, b) => a.institution.localeCompare(b.institution))
        .map((item) =>
          formatLine({
            id: item.id,
            institution: item.institution,
            degree: item.degree,
            year: item.year,
            location: item.location,
            url: `/education#${item.id}`,
            cvFeatured: item.cvFeatured,
          }),
        ),
      status: "success",
    }),
  );

  sections.push(
    buildSectionLines({
      name: "certifications",
      fields: ["id", "institution", "name", "year", "location", "url", "cvFeatured"],
      rows: certifications
        .toSorted((a, b) => a.institution.localeCompare(b.institution))
        .map((cert) =>
          formatLine({
            id: cert.id,
            institution: cert.institution,
            name: cert.name,
            year: cert.year,
            location: cert.location,
            url: `/education#${cert.id}`,
            cvFeatured: cert.cvFeatured,
          }),
        ),
      status: "success",
    }),
  );

  sections.push(
    buildSectionLines({
      name: "courses",
      fields: ["id", "institution", "name", "year", "location", "url", "cvFeatured"],
      rows: recentCourses
        .toSorted((a, b) => a.institution.localeCompare(b.institution))
        .map((course) =>
          formatLine({
            id: course.id,
            institution: course.institution,
            name: course.name,
            year: course.year,
            location: course.location,
            url: `/education#${course.id}`,
            cvFeatured: course.cvFeatured,
          }),
        ),
      status: "success",
    }),
  );

  let blogPosts: BlogPost[] = [];
  try {
    blogPosts = await getAllMDXPostsForSearch();
    sections.push(
      buildSectionLines({
        name: "blog",
        fields: ["slug", "title", "publishedAt", "tags", "url"],
        rows: buildBlogRows(blogPosts),
        status: "success",
      }),
    );
  } catch (error) {
    envLogger.log("[RAG Inventory] Failed to load blog posts", { error }, { category: "RAG" });
    failedSections.push("blog");
    sections.push(
      buildSectionLines({
        name: "blog",
        fields: ["slug", "title", "publishedAt", "tags", "url"],
        rows: [],
        status: "failed",
        note: "Failed to load blog posts",
      }),
    );
  }

  return { sections, failedSections, blogPosts };
}
