/**
 * Search Utilities
 */

import { posts } from '@/data/blog/posts';
import { experiences } from '@/data/experience';
import { education, certifications } from '@/data/education';
import { investments } from '@/data/investments';
import type { BlogPost } from '@/types/blog';
import type { SearchResult } from '@/types/search';

export async function searchPosts(query: string): Promise<BlogPost[]> {
  if (!query) return posts;
  
  const searchTerms = query.toLowerCase().split(' ');
  return posts.filter(post => {
    const searchText = [
      post.title,
      post.excerpt,
      ...post.tags,
      post.author.name
    ].join(' ').toLowerCase();
    
    return searchTerms.every(term => searchText.includes(term));
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

  const searchTerms = query.toLowerCase().split(' ');
  return investments.filter(inv => {
    const searchText = [
      inv.name,
      inv.description,
      inv.type,
      inv.status,
      inv.year
    ].join(' ').toLowerCase();
    
    return searchTerms.every(term => searchText.includes(term));
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

  const searchTerms = query.toLowerCase().split(' ');
  return experiences.filter(exp => {
    const searchText = [
      exp.company,
      exp.role,
      exp.period
    ].join(' ').toLowerCase();
    
    return searchTerms.every(term => searchText.includes(term));
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

  const searchTerms = query.toLowerCase().split(' ');
  return allItems.filter(item => {
    const searchText = [
      item.label,
      item.description
    ].join(' ').toLowerCase();
    
    return searchTerms.every(term => searchText.includes(term));
  });
}