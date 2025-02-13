/**
 * Search Utilities Module
 *
 * This module provides search functionality that is exclusively accessible through the terminal GUI
 * component of the website. All search operations are executed as terminal commands and displayed
 * within the terminal interface.
 *
 * Terminal Search Command Syntax:
 * search <category> <query>
 *
 * Available Categories:
 * - blog: Search through blog posts (e.g., 'search blog typescript')
 *   Searchable fields: title, excerpt, tags, author.name
 *
 * - investments: Search through investments (e.g., 'search investments fintech')
 *   Searchable fields: name, description, type, status, founded_year, invested_year, acquired_year, shutdown_year
 *
 * - experience: Search through professional experience (e.g., 'search experience engineer')
 *   Searchable fields: company, role, period
 *
 * - education: Search through education and certifications (e.g., 'search education computer science')
 *   Searchable fields: institution (label), degree/name (description)
 *
 * Note: The category parameter is required. Using just 'search <query>' without a category will result in an error.
 *
 * Search Results Display:
 * Results are displayed in a selectable format in the terminal interface. Users can:
 * 1. Navigate through results using up/down arrow keys
 * 2. Select a result by pressing Enter to navigate to the corresponding page
 * 3. View formatted output showing the main title/label and description for each result
 *
 * @see {@link components/ui/terminal/navigationCommands} For terminal command processing and result display
 * @see {@link types/terminal} For terminal command and selection interfaces
 * @see {@link data/blog/posts} For blog post data structure
 * @see {@link data/investments} For investment data structure
 * @see {@link data/experience} For experience data structure
 * @see {@link data/education} For education and certification data structure
 *
 * All search functions are case-insensitive and support both exact matches and partial matches.
 * Multi-word queries will match all terms across specified fields.
 */

import { experiences } from '../data/experience';
import { education, certifications } from '../data/education';
import { investments } from '../data/investments';
import type { BlogPost } from '../types/blog';
import type { SearchResult } from '../types/search';
import type { SelectionItem } from '../types/terminal';
import { sortDates } from './dateTime';
import { getAllPosts } from './blog';

/**
 * Searches through blog posts based on the provided query string.
 *
 * @param query - The search query string
 * @returns Promise resolving to an array of matching BlogPost objects, sorted by publish date
 *
 * @example
 * // Return all posts (empty query)
 * const allPosts = await searchPosts('');
 *
 * // Search by exact title
 * const exactMatch = await searchPosts('Getting Started with TypeScript');
 *
 * // Search by multiple terms (matches across title, excerpt, tags, author)
 * const multiTermSearch = await searchPosts('react typescript');
 *
 * // Search by author
 * const authorPosts = await searchPosts('John Doe');
 *
 * // Search by tag
 * const taggedPosts = await searchPosts('javascript');
 */
export const searchPosts = async (query: string, posts: BlogPost[]) => {
  if (!query) return posts.map(post => ({
    label: post.title,
    value: `blog-${post.slug}`,
    action: "navigate" as const,
    path: `/blog/${post.slug}#content`
  }));

  const searchTerms = query.toLowerCase().split(' ').filter(Boolean);
  return posts.filter(post => {
    // First try exact title match
    if (post.title.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Then try matching all terms across fields
    const searchFields = [
      post.title,
      post.excerpt,
      ...post.tags,
      post.author.name
    ].filter((field): field is string =>
      typeof field === 'string' && field.length > 0
    );

    return searchTerms.every(term =>
      searchFields.some(field => field.toLowerCase().includes(term))
    );
  }).sort((a, b) => sortDates(a.publishedAt, b.publishedAt))
  .map(post => ({
    label: post.title,
    value: `blog-${post.slug}`,
    action: "navigate",
    path: `/blog/${post.slug}#content`
  }));
};

/**
 * Searches through investment records based on the provided query string.
 *
 * @param query - The search query string
 * @returns Promise resolving to an array of SearchResult objects containing matching investments
 *
 * @example
 * // Return all investments (empty query)
 * const allInvestments = await searchInvestments('');
 *
 * // Search by exact company name
 * const exactMatch = await searchInvestments('Acme Corp');
 *
 * // Search by multiple terms (matches across name, description, type, status)
 * const multiTermSearch = await searchInvestments('fintech seed active');
 *
 * // Search by year
 * const yearSearch = await searchInvestments('2023');
 */
export async function searchInvestments(query: string): Promise<SelectionItem[]> {
  if (!query) return investments.map(inv => ({
    label: inv.name,
    value: `investment-${inv.id}`,
    action: "navigate" as const,
    path: `/investments#${inv.stableKey}`
  }));

  const searchTerms = query.toLowerCase().split(' ').filter(Boolean);
  return investments.filter(inv => {
    // First try exact name match
    if (inv.name.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Then try matching all terms across fields
    const searchFields = [
      inv.name,
      inv.description,
      inv.type,
      inv.status,
      inv.founded_year,
      inv.invested_year,
      inv.acquired_year,
      inv.shutdown_year
    ].filter((field): field is string =>
      typeof field === 'string' && field.length > 0
    );

    // Check if all search terms match any of the fields
    return searchTerms.every(term =>
      searchFields.some(field => field.toLowerCase().includes(term))
    );
  }).map(inv => ({
    label: inv.name,
    value: `investment-${inv.id}`,
    action: "navigate",
    path: `/investments#${inv.stableKey}`
  }));
}

/**
 * Searches through professional experience records based on the provided query string.
 *
 * @param query - The search query string
 * @returns Promise resolving to an array of SearchResult objects containing matching experience entries
 *
 * @example
 * // Return all experience entries (empty query)
 * const allExperience = await searchExperience('');
 *
 * // Search by exact company name
 * const exactMatch = await searchExperience('Tech Corp');
 *
 * // Search by role
 * const roleSearch = await searchExperience('Senior Engineer');
 *
 * // Search by time period
 * const periodSearch = await searchExperience('2022');
 */
export async function searchExperience(query: string): Promise<SelectionItem[]> {
  if (!query) return experiences.map(exp => ({
    label: exp.company,
    value: `experience-${exp.id}`,
    action: "navigate" as const,
    path: `/experience#${exp.stableKey}`
  }));

  const searchTerms = query.toLowerCase().split(' ').filter(Boolean);
  return experiences.filter(exp => {
    // First try exact company match
    if (exp.company.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Then try matching all terms across fields
    const searchFields = [
      exp.company,
      exp.role,
      exp.period
    ].filter((field): field is string =>
      typeof field === 'string' && field.length > 0
    );

    return searchTerms.every(term =>
      searchFields.some(field => field.toLowerCase().includes(term))
    );
  }).map(exp => ({
    label: exp.company,
    value: `experience-${exp.id}`,
    action: "navigate",
    path: `/experience#${exp.stableKey}`
  }));
}

export async function searchEducation(query: string): Promise<SelectionItem[]> {
  if (!query) {
    return [
      ...education.map(edu => ({
        label: edu.institution,
        value: `education-${edu.id}`,
        action: "navigate" as const,
        path: `/education#${edu.stableKey}`
      })),
      ...certifications.map(cert => ({
        label: cert.institution,
        value: `certification-${cert.id}`,
        action: "navigate" as const,
        path: `/education#${cert.stableKey}`
      }))
    ];
  }

  const searchTerms = query.toLowerCase().split(' ').filter(Boolean);

  const matchingEducation = education.filter(edu => {
    const searchFields = [
      edu.institution,
      edu.degree
    ].filter((field): field is string =>
      typeof field === 'string' && field.length > 0
    );

    return searchTerms.every(term =>
      searchFields.some(field => field.toLowerCase().includes(term))
    );
  }).map(edu => ({
    label: edu.institution,
    value: `education-${edu.id}`,
    action: "navigate" as const,
    path: `/education#${edu.stableKey}`
  }));

  const matchingCertifications = certifications.filter(cert => {
    const searchFields = [
      cert.institution,
      cert.name
    ].filter((field): field is string =>
      typeof field === 'string' && field.length > 0
    );

    return searchTerms.every(term =>
      searchFields.some(field => field.toLowerCase().includes(term))
    );
  }).map(cert => ({
    label: cert.institution,
    value: `certification-${cert.id}`,
    action: "navigate" as const,
    path: `/education#${cert.stableKey}`
  }));

  return [...matchingEducation, ...matchingCertifications];
}
