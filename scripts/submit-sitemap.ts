#!/usr/bin/env ts-node

/**
 * Sitemap Submission Script
 *
 * Submits sitemap.xml to Google and Bing search engines
 * to notify them of content updates after data refreshes.
 */

const SITE_URL = 'https://williamcallahan.com';
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`;

async function submitToGoogle(): Promise<boolean> {
  try {
    // Google Search Console API endpoint for sitemap submission
    const googleUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;

    const response = await fetch(googleUrl, { method: 'GET' });

    if (response.ok) {
      console.log('[SitemapSubmit] ✅ Successfully submitted sitemap to Google');
      return true;
    }
    console.error(`[SitemapSubmit] ❌ Google submission failed: ${response.status} ${response.statusText}`);
    return false;
  } catch (error) {
    console.error('[SitemapSubmit] ❌ Error submitting to Google:', error);
    return false;
  }
}

async function submitToBing(): Promise<boolean> {
  // Use the IndexNow protocol instead of deprecated sitemap ping
  const INDEXNOW_KEY = process.env.INDEXNOW_KEY;
  if (!INDEXNOW_KEY) {
    console.error('[SitemapSubmit] ❌ INDEXNOW_KEY env var not set, skipping IndexNow submission.');
    return false;
  }
  const host = new URL(SITE_URL).host;
  const indexnowUrl = `https://www.bing.com/indexnow?url=${encodeURIComponent(SITEMAP_URL)}&key=${INDEXNOW_KEY}&host=${host}`;
  try {
    const response = await fetch(indexnowUrl, { method: 'GET' });
    if (response.ok) {
      console.log('[SitemapSubmit] ✅ Successfully submitted sitemap via IndexNow to Bing');
      return true;
    }
    console.error(`[SitemapSubmit] ❌ IndexNow submission failed: ${response.status} ${response.statusText}`);
    return false;
  } catch (error) {
    console.error('[SitemapSubmit] ❌ Error submitting via IndexNow to Bing:', error);
    return false;
  }
}

async function submitSitemap(): Promise<void> {
  console.log(`[SitemapSubmit] Submitting sitemap: ${SITEMAP_URL}`);

  const [googleSuccess, bingSuccess] = await Promise.all([
    submitToGoogle(),
    submitToBing()
  ]);

  const successCount = (googleSuccess ? 1 : 0) + (bingSuccess ? 1 : 0);
  console.log(`[SitemapSubmit] Submission complete: ${successCount}/2 search engines notified`);
}

// Run if called directly
if (import.meta.main) {
  await submitSitemap().catch(error => {
    console.error('[SitemapSubmit] Unhandled error:', error);
    process.exit(1);
  });
}

export { submitSitemap };