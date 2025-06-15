# Education Architecture

## Overview

The Education feature displays a comprehensive list of university degrees, recent courses, and professional certifications. The architecture heavily favors server-side processing and rendering to deliver a fast and interactive user experience. It processes all data, including fetching logos, on the server at build time and passes the complete, ready-to-render data to the client.

## Architecture Diagram

See [Education Architecture Diagram](./education.mmd).

## Data & Rendering Flow

1. **Data Source**: Static arrays for `education`, `recentCourses`, and `certifications` are defined in `data/education.ts`.
2. **Server-Side Processing (`Education` server component)**:
    - This component imports the static data arrays.
    - It uses a server-only utility, `lib/education-data-processor.ts`, to process each item in the arrays.
3. **Logo & Data Enhancement (`education-data-processor`)**:
    - For each education, course, and certification item, this processor fetches the corresponding institution's logo.
    - It uses `lib/logo.server` to find the logo and handles fallbacks by providing a placeholder SVG. The placeholder logic is robust, checking multiple file paths to ensure compatibility with different environments (e.g., local vs. Docker).
    - The fetched logo is converted to a base64 data URL and attached to the item object.
4. **Client-Side Hydration (`EducationClient`)**:
    - This component receives the three fully-processed arrays (degrees, courses, certifications) with logo data included.
    - It manages the main "window" UI state.
    - It renders the university degrees as a series of featured `EducationCardClient` components.
    - It renders the courses and certifications in a single, interactive table that allows for client-side searching, filtering (by type), and sorting.

## Key Files & Components

- **Data Source**: `data/education.ts`
- **Main Server Component**: `components/features/education/education.server.tsx`
- **Main Client Component**: `components/features/education/education.client.tsx`
- **Server-Side Processor**: `lib/education-data-processor.ts` (Handles all logo fetching and data enhancement)
- **Card Components**:
  - `components/features/education/education-card.client.tsx`
  - `components/features/education/certification-card.client.tsx`
- **Types**: `types/education.ts`

## Design Pattern

This feature is a prime example of a "smart server, dumb client" pattern within the Next.js App Router paradigm. All heavy lifting (data fetching, processing, logo fetching) is done on the server, generating props that can be easily consumed by client components whose primary job is to handle user interaction and state management.
