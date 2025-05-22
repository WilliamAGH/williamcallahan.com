import { TweetEmbed } from '@/components/features/blog/tweet-embed'; // Use the existing component
import React from 'react';

export default function TweetComponentTestPage() {
  const spaceXTweetUrl = "https://twitter.com/SpaceX/status/1732824684683784516";
  // A tweet with a static image for comparison
  const staticImageTweetUrl = "https://twitter.com/nextjs/status/1925228425301893481"; // Example: Next.js Conf announcement

  return (
    <div style={{ padding: '20px' }}>
      <h1>Test Page for Existing `TweetEmbed` Component</h1>
      <p>This page uses your <code>components/features/blog/tweet-embed.tsx</code> which is already configured to use the image proxy.</p>

      <h2 style={{ marginTop: '30px' }}>SpaceX Tweet (with video):</h2>
      <TweetEmbed url={spaceXTweetUrl} />

      <hr style={{ margin: '40px 0' }} />

      <h2 style={{ marginTop: '30px' }}>Tweet with Static Image (Next.js Conf):</h2>
      <TweetEmbed url={staticImageTweetUrl} />

      <hr style={{ margin: '40px 0' }} />
      <p>
        Check the browser console for errors and the network tab for image requests (which should go via your proxy).
      </p>
      <p>
        The old test page with direct HTML is still available at{' '}
        <a href="/tweet-test.html">/tweet-test.html</a>.
      </p>
    </div>
  );
}
