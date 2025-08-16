// types/env.d.ts

/**
 * Environment Variables Type Definitions
 * @module types/env
 * @description
 * Type definitions for environment variables used in the application.
 * Extends the global NodeJS.ProcessEnv interface to provide type safety
 * for environment variables.
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /** Public-facing URL of the site */
      NEXT_PUBLIC_SITE_URL: string;

      // Analytics Configuration
      /** Umami Analytics website ID for tracking */
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: string;

      // S3 CDN Configuration
      /** S3 CDN URL for serving images and assets */
      NEXT_PUBLIC_S3_CDN_URL: string;
    }
  }

  // Window interface is defined in analytics.d.ts
}

export {};
