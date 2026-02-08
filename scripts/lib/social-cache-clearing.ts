/**
 * Social media cache clearing utilities.
 * Submits URLs to Facebook, Twitter, and LinkedIn debugging tools
 * to force re-scraping of OpenGraph metadata.
 */

/**
 * Clears social media caches using official platform debugging tools.
 * Some 400/403 errors are expected due to rate limiting;
 * success means the platform has queued a cache refresh.
 *
 * @see https://developers.facebook.com/tools/debug/
 * @see https://cards-dev.twitter.com/validator
 * @see https://www.linkedin.com/post-inspector/
 */
export async function clearSocialMediaCaches(url: string): Promise<{
  facebook: boolean;
  twitter: boolean;
  linkedin: boolean;
}> {
  const results = {
    facebook: false,
    twitter: false,
    linkedin: false,
  };

  // Facebook Sharing Debugger
  try {
    const facebookDebugUrl = `https://developers.facebook.com/tools/debug/sharing/?q=${encodeURIComponent(url)}`;
    console.log(`🔄 Submitting to Facebook Sharing Debugger...`);

    // Facebook's debugger requires a POST request to actually clear cache
    const fbResponse = await fetch("https://graph.facebook.com/v18.0/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `id=${encodeURIComponent(url)}&scrape=true`,
    });

    if (fbResponse.ok) {
      results.facebook = true;
      console.log(`✅ Facebook cache refresh requested`);
      console.log(`   Manual verification: ${facebookDebugUrl}`);
    } else {
      console.log(
        `⚠️  Facebook returned ${fbResponse.status} - cache refresh not confirmed (manual verification: ${facebookDebugUrl})`,
      );
    }
  } catch (error) {
    console.log(
      `⚠️  Facebook cache clearing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Twitter Card Validator
  try {
    const twitterValidatorUrl = `https://cards-dev.twitter.com/validator?url=${encodeURIComponent(url)}&preview=true`;
    console.log(`🔄 Submitting to Twitter Card Validator...`);

    const twitterResponse = await fetch(twitterValidatorUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TwitterValidator/1.0)",
      },
    });

    if (twitterResponse.ok) {
      results.twitter = true;
      console.log(`✅ Twitter cache refresh requested`);
      console.log(`   Manual verification: ${twitterValidatorUrl}`);
    } else {
      console.log(
        `⚠️  Twitter returned ${twitterResponse.status} - cache refresh not confirmed (manual verification: ${twitterValidatorUrl})`,
      );
    }
  } catch (error) {
    console.log(
      `⚠️  Twitter cache clearing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // LinkedIn Post Inspector — no public API; inform the user directly
  const linkedinInspectorUrl = `https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(url)}`;
  console.log(`ℹ️  LinkedIn has no public refresh API; manual Post Inspector check required`);
  results.linkedin = false;
  console.log(`   Manual verification: ${linkedinInspectorUrl}`);

  return results;
}
