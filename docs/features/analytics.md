# Analytics

`src/components/analytics/analytics.client.tsx` loads Simple Analytics and Clicky after hydration outside development. Both providers retain their existing noscript pixels.

`__tests__/components/analytics/Analytics.test.tsx` verifies the rendered provider scripts and the development skip. Sentry remains the application's error-monitoring integration.
