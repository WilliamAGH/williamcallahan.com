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

## Key Files

- **UI Components**: `components/features/projects/`
- **Data Source**: `data/projects.ts`
- **Types**: `types/project.ts` (includes optional `cvFeatured` flag for the `/cv` curriculum vitae page)

## Recent Updates

- **2025-11-05** — Added the ComposerAI project (Svelte + Vite email client with Spring Boot/Qdrant/S3 services) to `data/projects.ts`, ensuring its screenshot lives at `images/other/projects/composerai-app.png` for the Projects cards.
- **2025-11-05** — Introduced `cvFeatured` flags in `data/projects.ts` so `/cv` can reuse the curated project list without duplicating data.
