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

      /**
       * Development-only toggle to disable heavy image processing for local debugging
       * Accepts '1' or 'true' to enable the disable behavior; anything else is treated as off.
       * Default: undefined (off)
       */
      DEV_DISABLE_IMAGE_PROCESSING?: "1" | "true" | "0" | "false" | undefined;

      /**
       * Development-only toggle to prefer S3 streaming and skip CPU-intensive image processing.
       * When set to '1' or 'true', UnifiedImageService will attempt to stream images directly to S3
       * and avoid resizing/re-encoding in development. Has no effect in production.
       */
      DEV_STREAM_IMAGES_TO_S3?: "1" | "true" | "0" | "false" | undefined;
    }
  }

  // Window interface is defined in analytics.d.ts
}
