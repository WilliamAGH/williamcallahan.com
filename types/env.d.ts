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
      /** Base URL of your Umami Analytics instance */
      NEXT_PUBLIC_UMAMI_URL: string;
    }
  }
}

export {}