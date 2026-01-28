# Interactive Containers Architecture

## Overview

The "interactive-containers" functionality group comprises UI components that act as interactive wrappers or containers for other content. Their primary purpose is to manage the visibility and layout of their children in response to user interaction, such as collapsing, expanding, or toggling.

These components are foundational building blocks for creating dynamic and space-efficient user interfaces.

## Key Files and Responsibilities

- **`components/ui/collapse-dropdown.client.tsx`**: A client-side component that renders a collapsible dropdown. It is used in functionalities like `blog-article` for MDX content and `macos-gui` for instructional tabs.
- **`components/ui/card.tsx`**: A set of composable components (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`) that provide a flexible and consistent container for displaying content in a card format. While primarily structural, it's often used as the base for interactive elements.
- **`components/ui/external-link.client.tsx`**: A client-side component that renders external links with proper SEO metadata, security attributes (`rel="noopener"`), and accessibility indicators. Falls back to a span element when no href is provided.
- **`types/component-types.ts`**: Defines shared TypeScript types and interfaces for UI components, promoting consistency and reusability across the component ecosystem.

## Logic Flow and Interactions

- **collapse-dropdown.client.tsx** manages visibility state internally, toggling between expanded and collapsed states on user interaction
- **card.tsx** provides a consistent container structure with header, content, and footer sections that can be composed as needed
- **external-link.client.tsx** handles external navigation with proper security attributes and accessibility indicators

## Related Documentation

- **App Layout Integration**: See [`app-layout.md`](./app-layout.md) for how interactive containers are used for external links
- **Blog Article Usage**: See [`blog-article.md`](./blog-article.md) for collapse-dropdown usage in MDX content
- **macOS GUI Usage**: See [`macos-gui.md`](./macos-gui.md) for collapse-dropdown usage in instructional tabs
- **Hook Integration**: See [`hooks.md`](./hooks.md) - the `use-anchor-scroll` hook specifically opens CollapseDropdown components when scrolling to anchors
