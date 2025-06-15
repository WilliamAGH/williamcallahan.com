# Experience Architecture

## Overview

The Experience feature showcases professional work history and a categorized list of skills. Following the established pattern in this repository, it uses a server-centric approach to pre-render content for performance. Experience cards, including their logos, are processed on the server at build time and sent to a client component that manages the UI.

## Architecture Diagram

See [Experience Architecture Diagram](./experience.mmd).

## Data & Rendering Flow

1. **Data Source**: A static array of `Experience` objects is defined in `data/experience.ts`. The skills are hardcoded directly within the `Skills` component.
2. **Page-Level Pre-Rendering (e.g., in `app/experience/page.tsx`)**:
    - The page component reads the `experiences` array from the data file.
    - It maps over this array and, for each item, renders an `ExperienceCard` server component. This generates an array of pre-rendered JSX elements (the cards).
3. **Logo Fetching (`ExperienceCard` server component)**:
    - This component is responsible for fetching the company logo for each experience item.
    - It uses `lib/logo.server` to find the logo and falls back to a static placeholder image if the logo isn't found.
    - The fetched logo is converted to a base64 data URL.
    - It then renders an `ExperienceCardClient` component, passing all the necessary props, including the logo's data URL.
4. **Client-Side Hydration (`Experience` client component)**:
    - The main `Experience` client component receives the array of pre-rendered cards as a prop.
    - Its primary role is to manage the interactive "window" state (minimize, maximize, close).
    - It then simply renders the array of server-generated cards.
5. **Skills Component**:
    - The `Skills` component is a separate, self-contained component that statically renders a list of skills. It does not have any complex data flow.

## Key Files & Components

- **Data Source**: `data/experience.ts`
- **Main Client Component**: `components/features/experience/experience.client.tsx`
- **Card Server Component**: `components/ui/experience-card/experience-card.server.tsx`
- **Card Client Component**: `components/ui/experience-card/experience-card.client.tsx`
- **Skills Component**: `components/features/experience/skills.tsx`
- **Types**: `types/experience.ts`
