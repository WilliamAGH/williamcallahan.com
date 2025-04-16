/**
 * Site-Wide Search API Route
 *
 * Aggregates search results from various sections of the site (blog, investments,
 * experience, education) based on a single query.
 */

import { NextResponse } from 'next/server';
import { searchBlogPostsServerSide } from '@/lib/blog/server-search';
import { searchInvestments, searchExperience, searchEducation } from '@/lib/search';
import type { SearchResult } from '@/types/search';

// Ensure this route is not statically cached
export const dynamic = 'force-dynamic';

/**
 * Server-side API route for site-wide search.
 *
 * This route handles GET requests to search across multiple sections of the site
 * (blog, investments, experience, education) based on a single query.
 *
 * @param request - The HTTP request object.
 * @returns A JSON response containing the search results or an error message.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ error: 'Search query parameter "q" is required' }, { status: 400 });
    }

    // Perform searches in parallel
    const [blogResults, investmentResults, experienceResults, educationResults] = await Promise.all([
      searchBlogPostsServerSide(query), // Already returns SearchResult[] with [Blog] prefix
      searchInvestments(query),
      searchExperience(query),
      searchEducation(query)
    ]);

    // Add prefixes to non-blog results for clarity in the terminal
    const prefixedInvestmentResults = investmentResults.map(r => ({ ...r, label: `[Investments] ${r.label}` }));
    const prefixedExperienceResults = experienceResults.map(r => ({ ...r, label: `[Experience] ${r.label}` }));
    const prefixedEducationResults = educationResults.map(r => ({ ...r, label: `[Education] ${r.label}` }));

    // Combine all results
    const combinedResults: SearchResult[] = [
      ...blogResults,
      ...prefixedInvestmentResults,
      ...prefixedExperienceResults,
      ...prefixedEducationResults
    ];

    // Optional: Sort combined results? Or keep them grouped by section?
    // For now, keeping them grouped might be clearer.

    return NextResponse.json(combinedResults);

  } catch (error) {
    console.error('Site-wide search API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to perform site-wide search', details: errorMessage }, { status: 500 });
  }
}
