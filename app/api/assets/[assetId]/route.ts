/**
 * Asset Proxy API Route
 * 
 * Proxies asset requests to the external bookmarks service
 * This handles images and screenshots from the bookmarks API
 */

import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  
  console.log(`[DEBUG] Assets API - Received request for assetId: ${assetId}`);
  console.log(`[DEBUG] Assets API - Request URL: ${request.url}`);
  console.log(`[DEBUG] Assets API - Request method: ${request.method}`);
  console.log(`[DEBUG] Assets API - User-Agent: ${request.headers.get('user-agent')}`);
  console.log(`[DEBUG] Assets API - Referer: ${request.headers.get('referer')}`);
  
  if (!assetId) {
    console.log('[DEBUG] Assets API - Asset ID is missing');
    return NextResponse.json({ error: 'Asset ID is required' }, { status: 400 });
  }

  try {
    // Get the external bookmarks API URL
    const bookmarksApiUrl = process.env.BOOKMARKS_API_URL ?? 'https://bookmark.iocloudhost.net/api/v1';
    // Derive the base URL without version prefix for asset endpoints
    const baseUrl = bookmarksApiUrl.replace(/\/api\/v1$/, '');
    const bearerToken = process.env.BOOKMARK_BEARER_TOKEN;
    
    console.log(`[DEBUG] Assets API - Bookmarks API URL: ${bookmarksApiUrl}`);
    console.log(`[DEBUG] Assets API - Base URL: ${baseUrl}`);
    console.log(`[DEBUG] Assets API - Bearer token present: ${!!bearerToken}`);
    console.log(`[DEBUG] Assets API - Bearer token length: ${bearerToken?.length || 0}`);
    if (bearerToken) {
      console.log(`[DEBUG] Assets API - Bearer token starts with: ${bearerToken.substring(0, 10)}...`);
    }
    
    // Construct the asset URL for the external service (non-versioned asset endpoint)
    const assetUrl = `${baseUrl}/api/assets/${assetId}`;
    console.log(`[DEBUG] Assets API - Fetching asset from: ${assetUrl}`);
    
    // Prepare headers for external request
    const fetchHeaders = {
      'Authorization': `Bearer ${bearerToken}`,
      'User-Agent': 'williamcallahan.com/1.0',
      'Accept': '*/*',
    };
    
    console.log('[DEBUG] Assets API - Request headers:', fetchHeaders);
    
    // Fetch the asset from the external service
    const startTime = Date.now();
    const response = await fetch(assetUrl, {
      headers: fetchHeaders,
      method: 'GET',
    });
    const fetchDuration = Date.now() - startTime;

    console.log(`[DEBUG] Assets API - Fetch completed in ${fetchDuration}ms`);
    console.log(`[DEBUG] Assets API - Response status: ${response.status} ${response.statusText}`);
    console.log('[DEBUG] Assets API - Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      console.error(`[DEBUG] Assets API - Failed to fetch asset ${assetId}: ${response.status} ${response.statusText}`);
      
      // Try to get error details from response body
      try {
        const errorText = await response.text();
        console.error(`[DEBUG] Assets API - Error response body: ${errorText}`);
      } catch (bodyError) {
        console.error('[DEBUG] Assets API - Could not read error response body:', bodyError);
      }
      
      return NextResponse.json(
        {
          error: 'Failed to fetch asset',
          assetId,
          externalUrl: assetUrl,
          status: response.status,
          statusText: response.statusText
        },
        { status: response.status }
      );
    }

    // Get the content type from the response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    console.log(`[DEBUG] Assets API - Content type: ${contentType}`);
    
    // Stream the response back to the client
    const buffer = await response.arrayBuffer();
    console.log(`[DEBUG] Assets API - Response buffer size: ${buffer.byteLength} bytes`);
    
    console.log(`[DEBUG] Assets API - Successfully returning asset ${assetId}`);
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error(`[DEBUG] Assets API - Unexpected error for asset ${assetId}:`, error);
    console.error('[DEBUG] Assets API - Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      {
        error: 'Internal server error',
        assetId,
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}