# Projects Architecture

## Overview

The Projects feature displays a filterable list of projects using a hybrid server-client approach. Server Components pre-render the project list for fast initial loads, while Client Components handle all user interactivity, such as filtering by tags and managing the "windowed" UI.

## Architecture Diagram

See [Projects Architecture Diagram](./projects.mmd).

## Core Components

### Client-Side

- **`ProjectsClient` (`.../projects.client.tsx`)**: The main client-side entry point. It integrates the `ProjectsWindow` and `ProjectTagsClient`.
- **`ProjectsWindow` (`.../projects-window.client.tsx`)**: Manages the window state (normal, minimized, maximized) and renders the server-generated content within its frame.
- **`ProjectTagsClient` (`.../project-tags.client.tsx`)**: Renders the tag filters and handles the client-side logic for filtering the project list.

### Server-Side

- **`ProjectsListServer` (`.../projects-list.server.tsx`)**: Pre-renders the list of projects as static HTML. It filters projects based on a selected tag before rendering.
- **`ProjectCardServer` (`.../project-card.server.tsx`)**: Pre-renders an individual project card with its details (name, description, image, etc.).

## Data & Rendering Flow

1. On the server, `ProjectsListServer` fetches project data from `/data/projects.ts`.
2. It filters the data and renders a list of `ProjectCardServer` components into static HTML.
3. This static HTML is passed as a child to the `ProjectsClient` component.
4. On the client, `ProjectsClient` and `ProjectsWindow` render the UI frame, placing the server-generated HTML inside.
5. `ProjectTagsClient` handles user interaction, dynamically showing/hiding projects on the client side based on the selected tags.

## Resilience and Request Volume

- `src/app/projects/page.tsx` now treats CDN config/URL generation as optional for schema screenshots.
  - Missing or invalid CDN env/config no longer throws during render.
  - Schema generation falls back by omitting `screenshot` for impacted items.
- `src/components/features/projects/project-card.client.tsx` uses defensive CDN URL resolution.
  - Missing CDN config yields the existing placeholder path instead of throwing.
- Project detail links now set `prefetch={false}` in project cards.
  - This reduces high-volume prefetch fan-out from the projects grid under load.
  - Route transitions remain fully functional, but background request pressure is lower.

## Key Files

- **UI Components**: `components/features/projects/`
- **Data Source**: `data/projects.ts`
- **Types**: `types/project.ts` (includes optional `cvFeatured` flag for the `/cv` curriculum vitae page)

## Notable Projects

- **ComposerAI**: Svelte + Vite email client with Spring Boot/Qdrant/S3 services in `data/projects.ts`, screenshot at `images/other/projects/composerai-app.png`. Live at `https://composer.email`.
- **CV Integration**: `cvFeatured` flags in `data/projects.ts` allow `/cv` to reuse the curated project list without duplicating data.
