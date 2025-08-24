# App Layout Architecture

**Functionality:** `app-layout`

## Core Objective

Root layout wrapper providing global styles, providers, and consistent UI structure for all pages.

## Key Files

- **`app/layout.tsx`**: Root layout component
  - Inter font loading with `display: swap`
  - Global providers setup (theme, window registry)
  - Header with navigation and theme toggle
  - SEO metadata configuration
  - Hydration warning suppression and SVG transform fixes via `SvgTransformFixer` component

- **`__tests__/app/pages.smoke.test.ts`**: Smoke tests verifying all pages render

## Layout Structure

```
<html lang="en">
  <Providers>                              → See state-theme-window-providers.md
    <GlobalWindowRegistryProvider>         → See state-theme-window-providers.md
      <Header>
        <Navigation />                     → See navigation.md
        <SocialIcons />                    → See social-links.md
        <ThemeToggle />                    → See state-theme-window-providers.md
      </Header>
      <Main>
        <ClientTerminal />                 → See terminal.md
        {children}
      </Main>
      <FloatingRestoreButtons />          → See state-theme-window-providers.md
    </GlobalWindowRegistryProvider>
  </Providers>
  <Analytics />                           → See analytics.md
</html>
```

## Critical Implementation Details

### Hydration Warning Suppression

- Script in `<head>` intercepts console.error to suppress Dark Reader conflicts
- Fixes malformed SVG transform attributes on DOMContentLoaded

### Server Transition Detection

- Tracks page loads in sessionStorage
- Adds `.server-transition` class for rapid reloads (<2s)

### Responsive Header

- Mobile: Shows X icon only
- Desktop: Full social icon set in bordered container
- Max widths: 95% → 1400px (xl) → 1800px (2xl)

## SEO Metadata

- Dynamic `metadataBase` for dev/prod environments
- OpenGraph with default image from `data/metadata.ts`
- Twitter card configuration
- Format detection disabled for phone/address

## Integration Points

- **Navigation** → See [`navigation.md`](./navigation.md)
- **Theming** → See [`state-theme-window-providers.md`](./state-theme-window-providers.md)
- **Window Management** → See [`state-theme-window-providers.md`](./state-theme-window-providers.md)
- **Hooks** → See [`hooks.md`](./hooks.md) for anchor scrolling, SVG transforms, and other utilities
- **Analytics** → See [`analytics.md`](./analytics.md)
- **Error Handling** → See [`log-error-debug-handling.md`](./log-error-debug-handling.md) (multiple boundaries)

## Accessibility

- `lang="en"` on html element
- `suppressHydrationWarning` for extension compatibility
- Theme color scheme meta tag for OS integration
- Semantic HTML structure maintained

## Performance

- Resource hints: preconnect to fonts.googleapis.com, dns-prefetch for external domains
- Font loading: Inter with `display: swap` prevents FOIT
- Lazy loading: Suspense boundaries for non-critical components
- Layout shift prevention via fixed header heights

## Security

- CSP headers → Handled by Next.js config
- XSS prevention → React's built-in protections
- External links → See [`interactive-containers.md`](./interactive-containers.md)
- CORS → Proper crossOrigin attributes on resource hints

## Architecture Diagram

See [`app-layout.mmd`](./app-layout.mmd) for a visual representation of the layout hierarchy and component relationships.
