/**
 * Simple Open Graph Image API
 * Fetches OpenGraph image URLs from social media profiles
 */

import { type NextRequest, NextResponse } from 'next/server';
import type { OgFetchResult } from '@/types';
import { getDomainType } from '@/lib/utils/opengraph-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const fetchDomain = searchParams.get('fetchDomain') === 'true';

    if (!url) {
      console.log('Error: URL parameter is required');
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      console.log('Error: Invalid URL format');
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // --- SSRF Mitigation ---
    // 1. Allow-list supported domains
    const allowedHosts = [
      'github.com',
      'x.com',
      'twitter.com',
      'linkedin.com',
      'discord.com',
      'bsky.app',
      'cdn.bsky.app', // Added for Bluesky avatars
      'avatars.githubusercontent.com' // Added for GitHub avatars
    ];

    // Remove www. prefix for consistent checking
    const hostnameToCheck = parsedUrl.hostname.replace(/^www\./, '');

    if (!allowedHosts.includes(hostnameToCheck)) {
      console.log(`Error: Unsupported domain - ${parsedUrl.hostname}`);
      return NextResponse.json(
        { error: 'Unsupported domain' },
        { status: 400 }
      );
    }

    // 2. Reject local / private IPs (simplified check)
    // Note: This is a basic check. More robust validation might be needed depending on security requirements.
    if (/^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(parsedUrl.hostname)) {
      console.log(`Error: IP range not allowed - ${parsedUrl.hostname}`);
      return NextResponse.json({ error: 'IP range not allowed' }, { status: 400 });
    }
    // --- End SSRF Mitigation ---

    // Get domain type for special handling
    const domainType = getDomainType(url);
    console.log(`⏳ Fetching OpenGraph data for ${domainType} URL: ${url}`);

    // Parse URL to get root domain for fetching domain-level OG image
    const urlObj = new URL(url);
    const rootDomainUrl = `${urlObj.protocol}//${urlObj.hostname}`;

    // Setup for parallel fetches
    const fetchPromises: Promise<OgFetchResult>[] = [fetchOgDataForUrl(url)];

    if (fetchDomain) {
      console.log(`⏳ Also fetching domain-level OpenGraph data from: ${rootDomainUrl}`);
      fetchPromises.push(fetchOgDataForUrl(rootDomainUrl));
    }

    // Execute fetches
    let profileResult: OgFetchResult | null = null;
    let domainResult: OgFetchResult | null = null;

    if (fetchPromises.length === 1) {
      profileResult = await fetchPromises[0];
    } else if (fetchPromises.length === 2) {
      [profileResult, domainResult] = await Promise.all(fetchPromises);
    }

    // Get profile image with fallback
    let profileImageUrl = profileResult?.imageUrl;

    // For specific platforms, we need more reliable fallbacks
    if (!profileImageUrl || profileImageUrl.includes('placeholder')) {
      console.log(`⚠️ No profile image found for ${domainType}, using fallback`);
      profileImageUrl = getLocalImageForSocialNetwork(url);
    }

    // Get domain branding image - first try banner image from the profile result
    let domainBrandingImage = profileResult?.bannerImageUrl;

    // If no banner image, try domain result
    if (!domainBrandingImage) {
      // Use optional chaining for cleaner null checking
      domainBrandingImage = domainResult?.imageUrl ?? domainResult?.bannerImageUrl;
    }

    // If we still don't have a good domain image, use our pre-selected branding image
    if (!domainBrandingImage || domainBrandingImage.includes('placeholder')) {
      console.log(`⚠️ No domain branding image found for ${domainType}, using fallback`);
      domainBrandingImage = getDomainBrandingImage(url) || '';
    }

    // Construct the response with both profile and domain OG images
    return NextResponse.json({
      // Profile-specific OG image and metadata
      profileImageUrl: profileImageUrl,
      ogMetadata: profileResult?.ogMetadata || {},

      // Domain-level OG image (root site branding)
      domainImageUrl: domainBrandingImage,
      domainOgMetadata: domainResult?.ogMetadata || {},

      // Always provide fallbacks
      fallbackImageUrl: getLocalImageForSocialNetwork(url),
      error: profileResult?.error || null,

      // Include domain info for debugging
      domain: domainType
    });

  } catch (error) {
    console.error('💥 Critical API error:', error);
    return NextResponse.json({
      error: 'Failed to process request',
      profileImageUrl: '/images/company-placeholder.svg',
      domainImageUrl: null
    });
  }
}

/**
 * Fetch and process OpenGraph data for a specific URL
 */
async function fetchOgDataForUrl(url: string): Promise<OgFetchResult> {
  try {
    // Use the new resilient data access layer
    const { getOpenGraphData } = await import('@/lib/data-access/opengraph');
    const result = await getOpenGraphData(url);
    
    console.log(`🔍 Fetched OG data for ${url} from ${result.source}`);
    
    // Convert OgResult to OgFetchResult format
    return {
      imageUrl: result.imageUrl,
      bannerImageUrl: result.bannerImageUrl,
      ogMetadata: result.ogMetadata || {},
      error: result.error
    };
  } catch (error) {
    const domain = getDomainType(url);
    console.error(`❌ Error fetching OG data for ${url}:`, error);
    
    return {
      imageUrl: getLocalImageForSocialNetwork(url),
      bannerImageUrl: null,
      ogMetadata: {},
      error: `Failed to fetch from ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}


// getDomainType now imported from @/lib/utils/opengraph-utils for DRY compliance


/**
 * Get appropriate network-specific profile images
 */
function getLocalImageForSocialNetwork(url: string): string | null {
  const domain = getDomainType(url);

  // Return appropriate profile image based on domain
  switch (domain) {
    case 'GitHub':
      return 'https://avatars.githubusercontent.com/u/99231285?v=4';

    case 'X':
    case 'Twitter':
      return 'https://pbs.twimg.com/profile_images/1515007138717503494/KUQNKo_M_400x400.jpg';

    case 'LinkedIn':
      return 'https://media.licdn.com/dms/image/C5603AQGjv8C3WhrUfQ/profile-displayphoto-shrink_800_800/0/1651775977276?e=1716422400&v=beta&t=UwKIV3BKofXiG88FRnc7yp0oN75lmbQNHNTR2lqTJrY';

    case 'Discord':
      return '/images/william.jpeg'; // Discord doesn't have easy profile access

    case 'Bluesky':
      if (url.includes('williamcallahan.com')) {
        return 'https://cdn.bsky.app/img/avatar/plain/did:plc:o3rar2atqxlmczkaf6npbcqz/bafkreidpq75jyggvzlm5ddgpzhfkm4vprgitpxukqpgkrwr6sqx54b2oka@jpeg';
      }
      // Fallback to null if not the specific Bluesky profile, or handle generic Bluesky logo if available
      return '/images/bluesky_logo.svg'; // Or null if this is also a placeholder

    default:
      // Fallback to null if no specific image is available
      return '/images/william.jpeg'; // Or null
  }
}

/**
 * Get domain branding background images for each platform
 * These are beautiful banner/brand images for each platform
 */
function getDomainBrandingImage(url: string): string | null {
  const domain = getDomainType(url);

  // Return appropriate branding image based on domain (using local files)
  switch (domain) {
    case 'GitHub':
      return '/images/social-banners/github.svg';

    case 'X':
    case 'Twitter':
      return '/images/social-banners/twitter-x.svg';

    case 'LinkedIn':
      return '/images/social-banners/linkedin.svg';

    case 'Discord':
      return '/images/social-banners/discord.svg';

    case 'Bluesky':
      return '/images/social-banners/bluesky.png';

    default:
      return '/images/company-placeholder.svg';
  }
}
