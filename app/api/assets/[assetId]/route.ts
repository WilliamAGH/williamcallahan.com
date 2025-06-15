/**
 * Asset Proxy API Route
 * 
 * Proxies asset requests to the external bookmarks service
 * This handles images and screenshots from the bookmarks API
 */

import { type NextRequest, NextResponse } from 'next/server';

/**
 * Extracts the base URL from a bookmarks API URL more robustly
 * Handles various URL patterns and preserves path components other than /api/v1
 */
function getAssetBaseUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    const pathname = url.pathname;
    
    // Remove /api/v1 from the end if it exists, handling optional trailing slash
    const cleanedPathname = pathname.replace(/\/api\/v1\/?$/, '');
    
    return `${url.protocol}//${url.host}${cleanedPathname}`;
  } catch (error) {
    console.warn('[Assets API] URL parsing failed, using fallback:', error);
    // Fallback to regex replacement if URL parsing fails
    return apiUrl.replace(/\/api\/v1\/?$/, '');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  
  console.log(`[Assets API] Request for assetId: ${assetId}`);
  
  if (!assetId) {
    return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
  }

  try {
    // Get the external bookmarks API URL
    const bookmarksApiUrl = process.env.BOOKMARKS_API_URL ?? 'https://bookmark.iocloudhost.net/api/v1';
    // More robust base URL extraction
    const baseUrl = getAssetBaseUrl(bookmarksApiUrl);
    const bearerToken = process.env.BOOKMARK_BEARER_TOKEN;
    
    if (!bearerToken) {
      console.error('[Assets API] Bearer token not configured');
      return NextResponse.json({ error: 'Service configuration error' }, { status: 500 });
    }
    
    // Construct the asset URL for the external service (non-versioned asset endpoint)
    const assetUrl = `${baseUrl}/api/assets/${assetId}`;
    
    // Prepare headers for external request
    const fetchHeaders = {
      'Authorization': `Bearer ${bearerToken}`,
      'User-Agent': 'williamcallahan.com/1.0',
      'Accept': '*/*',
    };
    
    // Fetch the asset from the external service
    const response = await fetch(assetUrl, {
      headers: fetchHeaders,
      method: 'GET',
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });

    if (!response.ok) {
      console.error(`[Assets API] Failed to fetch asset ${assetId}: ${response.status}`);
      
      return NextResponse.json(
        {
          error: 'Failed to fetch asset',
          assetId
        },
        { status: response.status }
      );
    }

    // Get the content type from the response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // Stream the response instead of loading into memory
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error(`[Assets API] Error for asset ${assetId}:`, error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      {
        error: 'Internal server error',
        assetId
      },
      { status: 500 }
    );
  }
}