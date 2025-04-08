import { NextResponse } from 'next/server';
import { graphql } from '@octokit/graphql';
import * as cheerio from 'cheerio'; // Import cheerio
import { cache, CACHE_TTL } from '@/lib/cache'; // Import the cache utility and TTL constants
import type {
  ContributionDay,
  GitHubActivityApiResponse,
  GitHubGraphQLContributionResponse // Import the new type
} from '@/types/github';

const GITHUB_USERNAME = 'WilliamAGH';
const GITHUB_API_TOKEN = process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH;

// Map GraphQL contribution levels to numeric levels (0-4)
const mapContributionLevel = (level: string): number => {
  switch (level) {
    case 'NONE': return 0;
    case 'FIRST_QUARTILE': return 1;
    case 'SECOND_QUARTILE': return 2;
    case 'THIRD_QUARTILE': return 3;
    case 'FOURTH_QUARTILE': return 4;
    default: return 0;
  }
};

// Function to handle GitHub's 202 response by retrying with exponential backoff
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastResponse: Response | null = null;
  let retryCount = 0;
  let delay = 1000; // Start with 1 second delay

  while (retryCount < maxRetries) {
    const response = await fetch(url, options);

    // If it's not a 202 (computing stats), return the response
    if (response.status !== 202) {
      return response;
    }

    console.log(`Received 202 for ${url}, waiting ${delay}ms before retry ${retryCount + 1}/${maxRetries}`);
    lastResponse = response;

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, delay));

    // Exponential backoff
    delay *= 2;
    retryCount++;
  }

  // Return the last response if we've exhausted retries
  return lastResponse!;
}

// Fetch activity using GitHub GraphQL API
async function fetchActivityWithGraphQL(): Promise<GitHubActivityApiResponse> {
  if (!GITHUB_API_TOKEN) {
    throw new Error('GitHub API token (GITHUB_ACCESS_TOKEN_COMMIT_GRAPH) is missing.');
  }
  console.log(`Attempting to fetch GitHub activity for ${GITHUB_USERNAME} via GraphQL API...`);

  // Calculate date range for the last 365 days
  const today = new Date();
  const toDate = today.toISOString().split('T')[0]; // YYYY-MM-DD
  const fromDateObj = new Date();
  fromDateObj.setDate(today.getDate() - 365);
  const fromDate = fromDateObj.toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`Fetching contributions from ${fromDate} to ${toDate}`);

  try {
    // Add from/to dates to the query
    const { user } = await graphql<GitHubGraphQLContributionResponse>(`
      query($username: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $username) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              weeks {
                contributionDays {
                  contributionCount
                  contributionLevel
                  date
                }
              }
              # We fetch totalContributions from API but won't primarily use it
              totalContributions
            }
          }
        }
      }
    `, {
      username: GITHUB_USERNAME,
      from: fromDate + 'T00:00:00Z', // Add time for DateTime type
      to: toDate + 'T23:59:59Z',
      headers: {
        authorization: `bearer ${GITHUB_API_TOKEN}`,
      },
    });

    // Fetch lines added/removed using REST API
    let linesAdded = 0;
    let linesRemoved = 0;
    let totalReposProcessed = 0;
    let statsComputingRepos = 0;

    try {
      // First, get user's repositories
      console.log(`Fetching repositories for ${GITHUB_USERNAME}...`);
      const reposResponse = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100`, {
        headers: {
          'Authorization': `Bearer ${GITHUB_API_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (reposResponse.ok) {
        const repos = await reposResponse.json();
        console.log(`Found ${repos.length} repositories for ${GITHUB_USERNAME}`);

        if (repos.length === 0) {
          console.warn(`No repositories found for ${GITHUB_USERNAME}. Cannot calculate lines added/removed.`);
        }

        // Process each repository to get commit stats
        for (const repo of repos) {
          try {
            console.log(`Fetching stats for repo: ${repo.name}...`);
            // Get stats for this repository with retry logic
            const statsResponse = await fetchWithRetry(
              `https://api.github.com/repos/${GITHUB_USERNAME}/${repo.name}/stats/contributors`,
              {
                headers: {
                  'Authorization': `Bearer ${GITHUB_API_TOKEN}`,
                  'Accept': 'application/vnd.github.v3+json'
                }
              },
              2 // Maximum 2 retries (3 attempts total)
            );

            totalReposProcessed++;

            if (statsResponse.status === 202) {
              console.warn(`Stats still computing for repo ${repo.name} after retries`);
              statsComputingRepos++;
              continue;
            }

            if (statsResponse.ok) {
              const contributors = await statsResponse.json();
              console.log(`Found ${contributors.length} contributors for repo ${repo.name}`);

              // Find the user's contributions
              const userStats = Array.isArray(contributors) ?
                contributors.find(c => c.author && c.author.login === GITHUB_USERNAME) : null;

              if (userStats && userStats.weeks) {
                console.log(`Found ${userStats.weeks.length} weeks of contribution data for ${GITHUB_USERNAME} in repo ${repo.name}`);

                let repoAdded = 0;
                let repoRemoved = 0;
                let matchingWeeks = 0;

                for (const week of userStats.weeks) {
                  // Only count weeks within our 365-day window
                  const weekDate = new Date(week.w * 1000); // Convert UNIX timestamp to Date
                  if (weekDate >= fromDateObj && weekDate <= today) {
                    repoAdded += week.a || 0;
                    repoRemoved += week.d || 0;
                    matchingWeeks++;
                  }
                }

                console.log(`Repo ${repo.name}: ${matchingWeeks} weeks in timeframe, +${repoAdded} lines, -${repoRemoved} lines`);
                linesAdded += repoAdded;
                linesRemoved += repoRemoved;
              } else {
                console.log(`No contribution data found for ${GITHUB_USERNAME} in repo ${repo.name}`);
              }
            } else {
              console.warn(`Failed to fetch stats for repo ${repo.name}: ${statsResponse.status} ${statsResponse.statusText}`);
            }
          } catch (repoError) {
            console.warn(`Error fetching stats for ${repo.name}:`, repoError);
            // Continue with other repos
          }
        }

        console.log(`Stats processed for ${totalReposProcessed} repositories (${statsComputingRepos} still computing)`);
        console.log(`Successfully fetched code statistics: ${linesAdded} lines added, ${linesRemoved} lines removed`);

        if (linesAdded === 0 && linesRemoved === 0) {
          console.warn('No lines added/removed found. This could be due to:');
          console.warn('1. GitHub API token does not have sufficient permissions');
          console.warn('2. Stats are being computed by GitHub (202 response)');
          console.warn('3. No commits in the specified timeframe');
          console.warn('4. Repository is empty or has no commit history');
        }
      } else {
        console.warn(`Failed to fetch repositories: ${reposResponse.status} ${reposResponse.statusText}`);
        console.warn('Response body:', await reposResponse.text().catch(() => 'Could not read response body'));
      }
    } catch (statsError) {
      console.error('Error fetching code statistics:', statsError);
      // Don't throw - we can still return contribution data without line stats
    }

    const contributionDays = user.contributionsCollection.contributionCalendar.weeks.flatMap(
      week => week.contributionDays
    );

    const contributions: ContributionDay[] = contributionDays.map(day => ({
      date: day.date,
      count: day.contributionCount,
      level: mapContributionLevel(day.contributionLevel),
    }));

    // Calculate total contributions manually from the daily counts
    const calculatedTotalContributions = contributionDays.reduce(
      (sum, day) => sum + day.contributionCount,
      0
    );

    const apiTotalContributions = user.contributionsCollection.contributionCalendar.totalContributions;

    console.log(`Successfully fetched ${contributions.length} contribution days via GraphQL.`);
    console.log(`API reported total: ${apiTotalContributions}, Calculated total (including private): ${calculatedTotalContributions}`);

    // Return the manually calculated total and lines added/removed
    return {
      source: 'api',
      data: contributions,
      totalContributions: calculatedTotalContributions.toString(),
      linesAdded,
      linesRemoved,
    };

  } catch (error) {
    console.error('Error fetching GitHub activity via GraphQL:', error);
    throw new Error(`GraphQL API request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}


// Function to fetch and parse GitHub contribution graph via scraping (Fallback using cheerio)
async function fetchActivityByScraping(): Promise<GitHubActivityApiResponse> {
  console.warn(`Attempting fallback scraping for GitHub activity for ${GITHUB_USERNAME} using cheerio...`);
  const profileUrl = `https://github.com/${GITHUB_USERNAME}`;
  try {
    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!response.ok) {
      // Log status and potentially some response text if fetch fails
      const errorText = await response.text().catch(() => 'Could not read error response text');
      console.error(`Failed fetch: Status ${response.status}, URL: ${profileUrl}, Response sample: ${errorText.substring(0, 500)}`);
      throw new Error(`Failed to fetch GitHub profile page at ${profileUrl}: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();

    // --- DIAGNOSTIC LOG: Log beginning of HTML ---
    console.log(`HTML received (first 2000 chars):\n${html.substring(0, 2000)}...`);

    const $ = cheerio.load(html);

    // --- DIAGNOSTIC LOG: Check for main SVG ---
    const svgElements = $('svg');
    console.log(`Found ${svgElements.length} <svg> elements on the page.`);
    // Optionally log classes of SVGs found
    svgElements.each((i, el) => {
      const svgClass = $(el).attr('class') || 'no-class';
      if (svgClass.includes('calendar') || svgClass.includes('graph')) { // Log potentially relevant SVGs
         console.log(`Potentially relevant SVG ${i} class: ${svgClass}`);
      }
    });

    const contributions: ContributionDay[] = [];
    let totalContributionsText = 'unknown';

    // --- Selector for Daily Rects based on fetched HTML ---
    const dailyRectSelector = 'svg.js-calendar-graph-svg g > g > rect[data-date][data-level]';
    console.log(`Attempting to find daily rectangles with selector: ${dailyRectSelector}`);
    let loggedRectAttrs = false; // Flag to log attributes only once

    $(dailyRectSelector).each((_, element) => {
      const $rect = $(element);
      const date = $rect.attr('data-date');
      const levelAttr = $rect.attr('data-level');
      const level = levelAttr ? parseInt(levelAttr, 10) : 0;

      if (!loggedRectAttrs) {
        console.log(`First matching rect found. Attributes: date='${date}', level='${levelAttr}', id='${$rect.attr('id')}', class='${$rect.attr('class')}'`);
        loggedRectAttrs = true;
      }

      // Count extraction logic - Should work with tool-tip id
      let count = 0;
      const tooltipId = $rect.attr('id');
      let tooltipText = tooltipId ? $(`tool-tip[for="${tooltipId}"]`).text().trim() : '';
      // Fallback checks (less likely needed now but keep for safety)
      if (!tooltipText) {
        tooltipText = $rect.text().trim() || $rect.find('title').text().trim() || $rect.attr('aria-label') || '';
      }
      const countMatch = tooltipText.match(/^(\d+|No)\s+contribution/);
      if (countMatch) {
        count = countMatch[1] === 'No' ? 0 : parseInt(countMatch[1], 10);
      } else {
        const dataCount = $rect.attr('data-count'); // Unlikely fallback
        if (dataCount) {
          count = parseInt(dataCount, 10);
        }
      }

      if (date && !isNaN(level)) {
        contributions.push({ date, count: isNaN(count) ? 0 : count, level });
      }
    });

    // --- Selector for Total Contributions based on fetched HTML ---
    const totalCountSelector = 'div.js-yearly-contributions h2';
    const totalContributionsHeader = $(totalCountSelector).text().trim();
    console.log(`Checking for total contributions text using selector: ${totalCountSelector}`);
    console.log(`Text content found: "${totalContributionsHeader}"`);

    const totalMatch = totalContributionsHeader.match(/([\d,]+)\s+contributions\s+in\s+the\s+last\s+year/i);
    if (totalMatch && totalMatch[1]) {
      totalContributionsText = totalMatch[1].replace(/,/g, '');
      console.log(`Successfully extracted total contributions: ${totalContributionsText}`);
    } else {
       console.warn(`Could not extract total contributions count from text: "${totalContributionsHeader}" using regex.`);
    }

    if (contributions.length === 0) {
      if (!loggedRectAttrs) {
         console.warn('No rectangles found matching the primary selector. Attributes might have changed or graph structure is different.');
      } else {
         console.warn(`Rectangles were found, but the contributions array is still empty. Check processing logic.`);
      }
      console.warn(`Cheerio scraping found 0 contribution data rectangles using selector '${dailyRectSelector}'.`);
    }

    console.log(`Scraped ${contributions.length} contribution days. Total contributions found: ${totalContributionsText}`);
    return { source: 'scraping', data: contributions, totalContributions: totalContributionsText };

  } catch (error) {
    console.error('Error during scraping:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch activity by scraping from ${profileUrl}: ${errorMessage}`);
  }
}

// Cache key for GitHub activity data
const GITHUB_ACTIVITY_CACHE_KEY = 'github_activity_data';

export async function GET(request: Request) {
  // Log the environment variable to check if it's loaded
  console.log(`Checking GITHUB_ACCESS_TOKEN_COMMIT_GRAPH: ${process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH ? 'Loaded (partially hidden)' : 'Not Loaded or Empty'}`);

  try {
    // Check for cache invalidation request
    const url = new URL(request.url);
    const refreshCache = url.searchParams.get('refresh') === 'true';

    if (refreshCache) {
      console.log('Cache refresh requested, invalidating GitHub activity cache');
      cache.del(GITHUB_ACTIVITY_CACHE_KEY);
    }

    // Check if data is in cache
    const cachedData = cache.get<GitHubActivityApiResponse>(GITHUB_ACTIVITY_CACHE_KEY);

    if (cachedData) {
      console.log('Returning GitHub activity data from cache');
      return NextResponse.json(cachedData);
    }

    console.log('Cache miss for GitHub activity data, fetching fresh data');
    let activityData: GitHubActivityApiResponse;

    if (GITHUB_API_TOKEN) {
      try {
        // Prioritize GraphQL API if token exists
        activityData = await fetchActivityWithGraphQL();
      } catch (apiError) {
        console.warn('GraphQL API fetch failed, falling back to scraping:', apiError);
        // Fallback to scraping if API fails
        activityData = await fetchActivityByScraping();
      }
    } else {
      // Use scraping if no token is found
      console.log('No GitHub API token found, attempting scraping...');
      activityData = await fetchActivityByScraping();
    }

    // Store the fetched data in cache
    cache.set(GITHUB_ACTIVITY_CACHE_KEY, activityData, CACHE_TTL.DAILY);
    console.log(`GitHub activity data cached for ${CACHE_TTL.DAILY / 3600} hours`);

    // Return the data fetched from either source
    return NextResponse.json(activityData);

  } catch (error) {
    // Catch errors from the final attempt (likely scraping if API failed)
    console.error('Failed to get GitHub activity:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ source: 'error', error: 'Failed to fetch GitHub activity', details: errorMessage, data: [] }, { status: 500 });
  }
}

