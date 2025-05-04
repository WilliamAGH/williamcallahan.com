/**
 * Simple Open Graph Image API
 * Fetches OpenGraph image URLs from social media profiles
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const fetchDomain = searchParams.get('fetchDomain') === 'true';

    if (!url) {
      console.log('Error: URL parameter is required');
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
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
    const fetchPromises = [fetchOgDataForUrl(url)];

    // If we need to fetch the domain-level OG image too
    if (fetchDomain) {
      console.log(`⏳ Also fetching domain-level OpenGraph data from: ${rootDomainUrl}`);
      fetchPromises.push(fetchOgDataForUrl(rootDomainUrl));
    }

    // Execute both fetches in parallel for efficiency
    const [profileResult, domainResult] = await Promise.all(
      fetchPromises.concat(fetchDomain ? [] : [Promise.resolve(null as any)])
    );

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
      domainBrandingImage = domainResult?.imageUrl || domainResult?.bannerImageUrl;
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
async function fetchOgDataForUrl(url: string) {
  try {
    // Determine domain type for specialized handling
    const domain = getDomainType(url);
    console.log(`🔍 Fetching data for ${domain} URL: ${url}`);

    // Customize User-Agent for better scraping results
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml',
      'Accept-Language': 'en-US,en;q=0.9'
    };

    // Add credentials for certain sites that require them
    const options: RequestInit = { headers };
    if (domain === 'LinkedIn' || domain === 'Discord') {
      options.credentials = 'include';
    }

    // Fetch HTML from the URL
    if (process.env.NODE_ENV === 'development') {
      console.log(`📥 Sending request to ${url} with headers:`, headers);
    }
    const response = await fetch(url, options);

    if (!response.ok) {
      console.log(`❌ Failed to fetch from ${url}: ${response.status} ${response.statusText}`);
      return {
        imageUrl: getLocalImageForSocialNetwork(url),
        error: `Failed to fetch from ${domain}: ${response.status}`
      };
    }

    const html = await response.text();
    console.log(`✅ Successfully fetched HTML from ${domain} (${url}) - ${html.length} bytes`);

    // General handling for platforms with known OG pattern limitations
    // Note: We have specific handlers for each network below

    // Configuration for default/fallback profiles (could be moved to env vars)
    const DEFAULT_PROFILES: Record<string, string> = {
      GitHub: 'https://avatars.githubusercontent.com/u/99231285?v=4',
      X: 'https://pbs.twimg.com/profile_images/1515007138717503494/KUQNKo_M_400x400.jpg',
      Twitter: 'https://pbs.twimg.com/profile_images/1515007138717503494/KUQNKo_M_400x400.jpg',
      LinkedIn: 'https://media.licdn.com/dms/image/C5603AQGjv8C3WhrUfQ/profile-displayphoto-shrink_800_800/0/1651775977276',
      Bluesky: 'https://cdn.bsky.app/img/avatar/plain/did:plc:o3rar2atqxlmczkaf6npbcqz/bafkreidpq75jyggvzlm5ddgpzhfkm4vprgitpxukqpgkrwr6sqx54b2oka@jpeg',
      Discord: '/images/william.jpeg' // Local fallback for Discord
    };

    // Special handling for GitHub profile
    // Use the default profile if no specific user logic is needed
    if (domain === 'GitHub') {
      console.log(`ℹ️ Using GitHub-specific images`);
      return {
        imageUrl: DEFAULT_PROFILES.GitHub,
        bannerImageUrl: '/images/social-banners/github.svg',
        ogMetadata: { title: 'Profile on GitHub' } // Generic title
      };
    }

    // Special handling for X/Twitter
    // Use the default profile if no specific user logic is needed
    if (domain === 'X' || domain === 'Twitter') {
      console.log(`ℹ️ Using X/Twitter-specific images`);
      return {
        imageUrl: DEFAULT_PROFILES[domain], // Use domain (X or Twitter)
        bannerImageUrl: '/images/social-banners/twitter-x.svg',
        ogMetadata: { title: 'Profile on X' } // Generic title
      };
    }

    // Special handling for LinkedIn
    // Use the default profile if no specific user logic is needed
    if (domain === 'LinkedIn') {
      console.log(`ℹ️ Using LinkedIn-specific images`);
      return {
        imageUrl: DEFAULT_PROFILES.LinkedIn,
        bannerImageUrl: '/images/social-banners/linkedin.svg',
        ogMetadata: { title: 'Profile on LinkedIn' } // Generic title
      };
    }

    // Special handling for Discord - always uses local file paths
    if (domain === 'Discord') {
      console.log(`ℹ️ Using Discord-specific local images`);
      return {
        imageUrl: DEFAULT_PROFILES.Discord,
        bannerImageUrl: '/images/social-banners/discord.svg',
        ogMetadata: { title: 'Profile on Discord' } // Generic title
      };
    }

    // Special handling for Bluesky
    // Use the default profile if no specific user logic is needed
    if (domain === 'Bluesky') {
      console.log(`ℹ️ Using Bluesky-specific images`);
      return {
        imageUrl: DEFAULT_PROFILES.Bluesky,
        bannerImageUrl: '/images/social-banners/bluesky.png',
        ogMetadata: { title: 'Profile on Bluesky' } // Generic title
      };
    }

    // Extract Open Graph metadata with platform-specific parsing
    const ogTags = extractOpenGraphTags(html, url);
    console.log(`📊 Extracted ${domain} OG metadata for ${url}:`, ogTags);

    // First priority: platform-specific profile image extraction
    if (ogTags.profileImage) {
      let absoluteImageUrl;
      try {
        absoluteImageUrl = new URL(ogTags.profileImage, url).toString();
      } catch (urlError) {
        console.log(`⚠️ Error creating absolute URL for profile image ${ogTags.profileImage}: ${(urlError as Error).message}`);
        absoluteImageUrl = ogTags.profileImage; // Use as-is if we can't parse it
      }

      console.log(`👤 Found platform-specific profile image for ${domain}: ${absoluteImageUrl}`);

      // If we also have a banner image, return that too
      if (ogTags.bannerImage) {
        let absoluteBannerUrl;
        try {
          absoluteBannerUrl = new URL(ogTags.bannerImage, url).toString();
          console.log(`🏞️ Also found banner image for ${domain}: ${absoluteBannerUrl}`);
        } catch (urlError) {
          console.log(`⚠️ Error creating absolute URL for banner image: ${(urlError as Error).message}`);
          absoluteBannerUrl = ogTags.bannerImage; // Use as-is if we can't parse it
        }

        return {
          imageUrl: absoluteImageUrl,
          bannerImageUrl: absoluteBannerUrl,
          ogMetadata: ogTags
        };
      }

      return {
        imageUrl: absoluteImageUrl,
        ogMetadata: ogTags
      };
    }

    // Second priority: og:image
    if (ogTags.image) {
      let absoluteImageUrl;
      try {
        absoluteImageUrl = new URL(ogTags.image, url).toString();
      } catch (urlError) {
        console.log(`⚠️ Error creating absolute URL for og:image ${ogTags.image}: ${(urlError as Error).message}`);
        absoluteImageUrl = ogTags.image; // Use as-is if we can't parse it
      }

      console.log(`🖼️ Found og:image for ${domain}: ${absoluteImageUrl}`);

      return {
        imageUrl: absoluteImageUrl,
        ogMetadata: ogTags
      };
    }

    // Third priority: twitter:image
    if (ogTags.twitterImage) {
      let absoluteImageUrl;
      try {
        absoluteImageUrl = new URL(ogTags.twitterImage, url).toString();
      } catch (urlError) {
        console.log(`⚠️ Error creating absolute URL for twitter:image ${ogTags.twitterImage}: ${(urlError as Error).message}`);
        absoluteImageUrl = ogTags.twitterImage; // Use as-is if we can't parse it
      }

      console.log(`🖼️ Found twitter:image for ${domain}: ${absoluteImageUrl}`);

      return {
        imageUrl: absoluteImageUrl,
        ogMetadata: ogTags
      };
    }

    // No images found
    console.log(`⚠️ No Open Graph image found for ${domain} (${url})`);
    return {
      imageUrl: getLocalImageForSocialNetwork(url),
      ogMetadata: ogTags
    };

  } catch (fetchError) {
    console.log(`❌ Error during fetch or parsing for ${url}: ${(fetchError as Error).message}`);
    return {
      imageUrl: getLocalImageForSocialNetwork(url),
      error: `Fetch error: ${(fetchError as Error).message}`
    };
  }
}

/**
 * Determine domain type from URL for special handling
 */
function getDomainType(url: string): string {
  if (url.includes('github.com')) return 'GitHub';
  if (url.includes('x.com')) return 'X';
  if (url.includes('twitter.com')) return 'Twitter';
  if (url.includes('linkedin.com')) return 'LinkedIn';
  if (url.includes('discord.com')) return 'Discord';
  if (url.includes('bsky.app')) return 'Bluesky';

  const urlObj = new URL(url);
  return urlObj.hostname;
}

/**
 * Extract Open Graph tags from HTML content
 * Also extracts platform-specific content like profile images
 */
function extractOpenGraphTags(html: string, url: string = '') {
  const domain = getDomainType(url);

  // Standard OG tags extraction
  const result = {
    title: extractMetaContent(html, 'property="og:title"') ||
           extractMetaContent(html, 'name="twitter:title"'),

    description: extractMetaContent(html, 'property="og:description"') ||
                 extractMetaContent(html, 'name="twitter:description"'),

    image: extractMetaContent(html, 'property="og:image"'),

    twitterImage: extractMetaContent(html, 'name="twitter:image"') ||
                 extractMetaContent(html, 'name="twitter:image:src"'),

    site: extractMetaContent(html, 'property="og:site_name"') ||
          extractMetaContent(html, 'name="twitter:site"'),

    type: extractMetaContent(html, 'property="og:type"'),

    // Additional fields for platform-specific extraction
    profileImage: null as string | null,
    bannerImage: null as string | null
  };

  // Platform-specific image extraction
  try {
    if (domain === 'Bluesky' && url.includes('williamcallahan.com')) {
      // For Bluesky, try to extract the avatar image from the HTML
      console.log('🔍 Attempting to extract Bluesky profile avatar from HTML...');

      // Look for avatar image patterns in Bluesky's HTML
      const avatarPattern = /<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/i;
      const avatarMatch = html.match(avatarPattern);

      if (avatarMatch?.[1]) {
        console.log(`✅ Found Bluesky avatar: ${avatarMatch[1]}`);
        result.profileImage = avatarMatch[1];
      } else {
        // Fallback to a known pattern for Bluesky avatars
        const blueskyUserPattern = /did:plc:[a-zA-Z0-9]+/i;
        const didMatch = html.match(blueskyUserPattern);

        if (didMatch?.[0]) {
          console.log(`✅ Found Bluesky DID: ${didMatch[0]}`);
          // This is a fallback since we know William's avatar URL pattern
          result.profileImage = `https://cdn.bsky.app/img/avatar/plain/${didMatch[0]}/bafkreidpq75jyggvzlm5ddgpzhfkm4vprgitpxukqpgkrwr6sqx54b2oka@jpeg`;
        }
      }
    } else if (domain === 'GitHub') {
      // Look for GitHub avatar
      const avatarPattern = /<img[^>]*class="[^"]*avatar[^"]*"[^>]*src="([^"]+)"/i;
      const avatarMatch = html.match(avatarPattern);

      if (avatarMatch?.[1]) {
        console.log(`✅ Found GitHub avatar: ${avatarMatch[1]}`);
        result.profileImage = avatarMatch[1];
      }
    } else if (domain === 'X' || domain === 'Twitter') {
      // Extract Twitter profile image (from various patterns)
      console.log('🔍 Attempting to extract X/Twitter profile image...');

      // Try multiple patterns since Twitter's HTML structure can vary
      const twitterPatterns = [
        /<img[^>]*class="[^"]*css-9pa8cd[^"]*"[^>]*src="([^"]+)"/i,
        /<img[^>]*src="([^"]+)"[^>]*alt="[^"]*profile image/i,
        /<a[^>]*href="\/williamcallahan\/photo"[^>]*><img[^>]*src="([^"]+)"/i
      ];

      for (const pattern of twitterPatterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
          // Found a profile image
          console.log(`✅ Found X/Twitter profile image: ${match[1]}`);
          result.profileImage = match[1];
          break;
        }
      }

      // Banner extraction for X/Twitter
      const bannerPattern = /<img[^>]*class="[^"]*css-1dbjc4n[^"]*"[^>]*style="background-image: url\(&quot;([^&]+)&quot;\)"/i;
      const bannerMatch = html.match(bannerPattern);

      if (bannerMatch?.[1]) {
        console.log(`✅ Found X/Twitter banner image: ${bannerMatch[1]}`);
        result.bannerImage = bannerMatch[1];
      }
    } else if (domain === 'LinkedIn') {
      // LinkedIn profile image extraction
      console.log('🔍 Attempting to extract LinkedIn profile image...');

      // Try multiple patterns for LinkedIn
      const linkedinPatterns = [
        /<img[^>]*class="[^"]*profile-picture[^"]*"[^>]*src="([^"]+)"/i,
        /<img[^>]*class="[^"]*pv-top-card-profile-picture__image[^"]*"[^>]*src="([^"]+)"/i,
        /<img[^>]*id="ember[0-9]+"[^>]*src="([^"]+)"[^>]*alt="[^"]*profile/i
      ];

      for (const pattern of linkedinPatterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
          console.log(`✅ Found LinkedIn profile image: ${match[1]}`);
          result.profileImage = match[1];
          break;
        }
      }

      // LinkedIn background/banner image
      const backgroundPattern = /<img[^>]*class="[^"]*profile-background-image[^"]*"[^>]*src="([^"]+)"/i;
      const backgroundMatch = html.match(backgroundPattern);

      if (backgroundMatch?.[1]) {
        console.log(`✅ Found LinkedIn background image: ${backgroundMatch[1]}`);
        result.bannerImage = backgroundMatch[1];
      }
    }
  } catch (error) {
    console.error('Error during platform-specific image extraction:', error);
  }

  return result;
}

/**
 * Helper to extract content from meta tags
 */
function extractMetaContent(html: string, attributePattern: string): string | null {
  // Pattern to match meta tags with the given attribute
  const pattern = new RegExp(`<meta[^>]*${attributePattern}[^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  // Also match alternate order (content attribute comes first)
  const alternatePattern = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attributePattern}[^>]*>`, 'i');

  const match = html.match(pattern) || html.match(alternatePattern);
  return match ? match[1] : null;
}

/**
 * Get appropriate network-specific profile images
 */
function getLocalImageForSocialNetwork(url: string): string {
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
      return '/images/bluesky_logo.svg';

    default:
      return '/images/william.jpeg';
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