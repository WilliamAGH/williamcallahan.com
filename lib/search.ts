/**
 * Search Utilities
 */

import { posts } from '../data/blog/posts';
import { experiences } from '../data/experience';
import { education, certifications } from '../data/education';
import { investments } from '../data/investments';
import { generateUniqueSlug } from './utils/domain-utils';
import type { BlogPost } from '../types/blog';
import type { SearchResult } from '../types/search';

export function searchPosts(query: string): BlogPost[] {
  if (!query) return posts;

  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return posts.filter(post => {
    // First try exact title match
    if (post.title.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Combine all searchable fields into one long string for better matching
    const allContentText = [
      post.title || '',
      post.excerpt || '',
      ...(post.tags || []),
      post.author?.name || ''
    ].filter(field => typeof field === 'string' && field.length > 0)
      .join(' ')
      .toLowerCase();

    // Check if all search terms exist in the combined text
    return searchTerms.every(term => allContentText.includes(term));
  }).sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function searchInvestments(query: string): SearchResult[] {
  if (!query) return investments.map(inv => ({
    label: inv.name,
    description: inv.description,
    path: `/investments#${inv.id}`
  }));

  // Split the query into individual words for more flexible matching
  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return investments.filter(inv => {
    // First try exact name match
    if (inv.name.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Combine all searchable fields into one long string for better matching
    const allContentText = [
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
    ).join(' ').toLowerCase();

    // Check if all search terms exist in the combined text
    return searchTerms.every(term => allContentText.includes(term));
  }).map(inv => ({
    label: inv.name,
    description: inv.description,
    path: `/investments#${inv.id}`
  }));
}

export function searchExperience(query: string): SearchResult[] {
  if (!query) return experiences.map(exp => ({
    label: exp.company,
    description: exp.role,
    path: `/experience#${exp.id}`
  }));

  // Split the query into individual words for more flexible matching
  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return experiences.filter(exp => {
    // First try exact company match
    if (exp.company.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Combine all searchable fields into one long string for better matching
    const allContentText = [
      exp.company,
      exp.role,
      exp.period
    ].filter((field): field is string =>
      typeof field === 'string' && field.length > 0
    ).join(' ').toLowerCase();

    // Check if all search terms exist in the combined text
    return searchTerms.every(term => allContentText.includes(term));
  }).map(exp => ({
    label: exp.company,
    description: exp.role,
    path: `/experience#${exp.id}`
  }));
}

export function searchEducation(query: string): SearchResult[] {
  const allItems = [
    ...education.map(edu => ({
      label: edu.institution,
      description: edu.degree,
      path: `/education#${edu.id}`
    })),
    ...certifications.map(cert => ({
      label: cert.institution,
      description: cert.name,
      path: `/education#${cert.id}`
    }))
  ];

  if (!query) return allItems;

  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return allItems.filter(item => {
    // First try exact institution/name match
    if (item.label.toLowerCase() === query.toLowerCase() ||
        item.description.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Combine all searchable fields into one long string for better matching
    const allContentText = [
      item.label || '',
      item.description || ''
    ].filter(field => typeof field === 'string' && field.length > 0)
      .join(' ')
      .toLowerCase();

    // Check if all search terms exist in the combined text
    return searchTerms.every(term => allContentText.includes(term));
  });
}

export async function searchBookmarks(query: string): Promise<SearchResult[]> {
  // Import fetchExternalBookmarks dynamically to avoid circular dependencies
  const { fetchExternalBookmarks } = await import('./bookmarks.client');
  const bookmarks = await fetchExternalBookmarks();

  // Pre-compute slugs once
  const slugMap = new Map<string, string>();
  const getSlug = (b: typeof bookmarks[number]) => {
    if (!slugMap.has(b.id)) {
      slugMap.set(b.id, generateUniqueSlug(b.url, bookmarks, b.id));
    }
    const slug = slugMap.get(b.id);
    if (slug === undefined) {
      // This should be impossible given the logic in lines 158-160
      throw new Error(`Failed to generate or retrieve slug for bookmark ID: ${b.id}`);
    }
    return slug;
  };

  if (!query) {
    return bookmarks.map(b => ({
      label: b.title,
      description: b.description,
      path: `/bookmarks/${getSlug(b)}`
    }));
  }

  // Split the query into individual words for more flexible matching
  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  return bookmarks.filter(b => {
    // Combine all searchable fields into one long string for better matching
    const allContentText = [
      b.title || '',
      b.description || '',
      ...((Array.isArray(b.tags) ? b.tags : [])
        .map((t: string | import('@/types').BookmarkTag) => typeof t === 'string' ? t : (t.name || '')))
        .filter(Boolean),
      b.content?.author || '',
      b.content?.publisher || '',
      b.url || ''
    ].filter(text => text.length > 0)
      .join(' ')
      .toLowerCase();

    // Check if all search terms exist in any of the fields
    // This approach matches terms across fields (e.g., "jina" in title, "ai" in description)
    return searchTerms.every(term => allContentText.includes(term));
  }).map(b => ({
    label: b.title,
    description: b.description,
    path: `/bookmarks/${getSlug(b)}`
  }));
}
