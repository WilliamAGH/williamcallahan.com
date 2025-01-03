/**
 * Search Utilities
 */

import { posts } from '../data/blog/posts';
import { experiences } from '../data/experience';
import { education, certifications } from '../data/education';
import { investments } from '../data/investments';
import type { BlogPost } from '../types/blog';
import type { SearchResult } from '../types/search';

export async function searchPosts(query: string): Promise<BlogPost[]> {
  if (!query) return posts;

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
  }).sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export async function searchInvestments(query: string): Promise<SearchResult[]> {
  if (!query) return investments.map(inv => ({
    label: inv.name,
    description: inv.description,
    path: `/investments#${inv.id}`
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
    description: inv.description,
    path: `/investments#${inv.id}`
  }));
}

export async function searchExperience(query: string): Promise<SearchResult[]> {
  if (!query) return experiences.map(exp => ({
    label: exp.company,
    description: exp.role,
    path: `/experience#${exp.id}`
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
    description: exp.role,
    path: `/experience#${exp.id}`
  }));
}

export async function searchEducation(query: string): Promise<SearchResult[]> {
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

  const searchTerms = query.toLowerCase().split(' ').filter(Boolean);
  return allItems.filter(item => {
    // First try exact institution/name match
    if (item.label.toLowerCase() === query.toLowerCase() ||
        item.description.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Then try matching all terms across fields
    const searchFields = [
      item.label,
      item.description
    ].filter((field): field is string =>
      typeof field === 'string' && field.length > 0
    );

    return searchTerms.every(term =>
      searchFields.some(field => field.toLowerCase().includes(term))
    );
  });
}
