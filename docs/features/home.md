# Home Feature Architecture

## Overview

The Home feature comprises the components responsible for rendering the main landing page (`/`). This includes the primary `Home` component and a profile image component.

## Core Components

- **`app/page.tsx`**: The root page for the website. It handles the SEO metadata (including a `ProfilePage` JSON-LD schema) and renders the main `Home` component. It's configured for ISR with a one-hour revalidation.
- **`components/features/home/home.tsx`**: The main server component for the home page. It orchestrates the display of the introductory content.
- **`components/features/home/profile-image.tsx`**: A client component responsible for rendering the profile image, likely with optimizations (e.g., using `next/image`).
- **`components/features/home/index.ts`**: A barrel file that provides a clean, centralized export for the `Home` component, simplifying imports from other parts of the application.

## Logic Flow

1. A request to the root URL (`/`) is handled by `app/page.tsx`.
2. `app/page.tsx` renders the `Home` server component.
3. The `Home` component renders the main page layout, including the `ProfileImage` client component.
4. The `ProfileImage` component handles the rendering of the user's avatar on the client side.

This structure separates the page-level concerns (routing, SEO) from the component-level concerns (UI, content).
