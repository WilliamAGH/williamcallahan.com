# CSS Architecture

## Overview

This document maps the CSS architecture and styling system for the williamcallahan.com project. The application uses a combination of Tailwind CSS for utility-first styling, custom CSS for specific components, and Prism.js for syntax highlighting.

## Primary CSS Files

### app/globals.css

- **Purpose**: Global styles and CSS custom properties
- **Key Features**:
  - Tailwind CSS directives (@tailwind base, components, utilities)
  - CSS custom properties for theming (light/dark modes)
  - Smooth scrolling behavior with header offset
  - Terminal-specific text selection styles
  - Custom scrollbar styling
  - Glitch animation for 404 page
  - Project card fade-in animations
  - Window state-based visibility rules
  - Social icon positioning fixes
  - Dark Reader compatibility styles
  - React-tweet component fixes
  - Blog content responsive wrapping

### app/code-blocks.css

- **Purpose**: Dark mode overrides for code syntax highlighting
- **Key Features**:
  - Dark mode token colors for Prism.js
  - Overrides base Prism theme for dark mode
  - Custom color scheme (Dracula-inspired)
  - Token-specific styling (comments, keywords, strings, etc.)

### components/ui/simple-tabs.css

- **Purpose**: CSS-only tab component for MDX content
- **Key Features**:
  - Tab panel visibility control via data attributes
  - Tab button styling with active states
  - Dark mode support
  - Package manager tabs (npm, yarn, pnpm, bun)

### styles/social-styles.css

- **Purpose**: Social media card hover effects
- **Key Features**:
  - Brand-specific colors for each platform
  - Glow effects on hover
  - Banner image scale animations
  - Top bar color indicators (currently disabled)

### components/ui/code-block/prism-syntax-highlighting/prism.css

- **Purpose**: Base Prism.js syntax highlighting theme
- **Key Features**:
  - Custom font stack (IBM Plex Mono)
  - Token colors optimized for both light and dark backgrounds
  - Language-specific overrides
  - Selection color styling
  - Line wrapping support

## Theming System

### CSS Custom Properties

The application uses CSS custom properties for theming, defined in `:root` and `.dark`:

```css
--background, --foreground        # Base colors
--card, --card-foreground        # Card components
--primary, --secondary           # Brand colors
--muted, --accent               # UI states
--destructive                   # Error states
--border, --input, --ring       # Form elements
--chart-1 through --chart-5     # Data visualization
--radius                        # Border radius
```

### Dark Mode

- Implemented via class-based switching (`.dark` class)
- Separate color schemes for light and dark modes
- Special handling for code blocks and syntax highlighting

## Component-Specific Styles

### Terminal Components

- Custom text selection styles
- Scrollbar theming
- Focus management

### Code Blocks

- Dual-theme support (light/dark)
- Language-specific token colors
- Copy button positioning
- Line wrapping configuration

### Social Cards

- Platform-specific brand colors
- Hover animations
- Glow effects

### Navigation

- Window state visibility rules
- Mobile-specific adjustments
- Icon positioning fixes

## Performance Considerations

### CSS Loading Strategy

- Global styles loaded in app/layout.tsx
- Component-specific CSS imported where needed
- Prism.js theme loaded conditionally

### Optimization Issues

- Duplicate token color definitions between code-blocks.css and prism.css
- Unused CSS variables (chart colors)
- Overly specific selectors in some areas

## Accessibility

### Focus Management

- Focus trap utility for modal-like components
- Visible focus indicators
- Keyboard navigation support

### Color Contrast

- Token colors chosen for readability
- Selection colors with sufficient contrast
- Dark Reader compatibility

## Mobile Responsiveness

### Breakpoint Strategy

- Tailwind's default breakpoints
- Mobile-first approach
- Special handling for social icons on mobile

### Touch Support

- Custom scrollbar with touch device support
- Appropriate tap target sizes

## Browser Compatibility

### CSS Features Used

- CSS custom properties
- CSS Grid and Flexbox
- CSS animations and transitions
- Nested selectors (&)
- :has() selector (progressive enhancement)

### Vendor Prefixes

- -webkit-scrollbar for custom scrollbars
- -webkit-overflow-scrolling for iOS
- -webkit-user-select for text selection

## Known Issues

1. **Duplicate Styles**: Token colors defined in multiple files -- do not do this
2. **Dead Code**: Unused chart color variables -- do not do this
3. **Incomplete Features**: Social card top bars set to height: 0
4. **Hardcoded Values**: Tab system limited to specific package managers
5. **Specificity Wars**: Some styles use !important unnecessarily - not allowed

## Dependencies

- **Tailwind CSS**: Utility-first CSS framework
- **Prism.js**: Syntax highlighting
- **next-themes**: Dark mode management

## Best Practices

1. Use Tailwind utilities where possible
2. Define component-specific styles in dedicated files
3. Maintain consistent color usage via CSS variables
4. Test styles in both light and dark modes
5. Ensure mobile responsiveness
6. Consider accessibility in all styling decisions
7. **No `!important`** – Repository convention forbids the use of `!important`; resolve style conflicts via proper specificity, Tailwind config overrides, or layering order.

## Build Pipeline & Tooling Integration

The styling system relies on a small build pipeline that stitches together Tailwind, PostCSS and a few runtime helpers:

### Tailwind Configuration (`config/tailwind.config.js`)

- Central place for **design tokens** (fonts, colors, border-radius) and custom **keyframes** (`fadeInUp`, `pop`).
- Enables class-based dark mode (`darkMode: "class"`).
- Extends `@tailwindcss/typography` so prose elements inherit project typography rules.

### PostCSS Pipeline _(defined in `package.json`)_

- `tailwindcss/nesting` → Enables native nesting syntax so authored CSS can be closer to SCSS style without another pre-processor.
- `tailwindcss` → Generates the utility classes.
- `autoprefixer` → Adds vendor prefixes.
- `postcss-preset-env` → Polyfills modern CSS features (custom media queries, logical properties, etc.).

### Runtime Utilities

- **`tailwind-merge`** & **`class-variance-authority`** dynamically compose/merge class strings at runtime, preventing duplicate utilities.
- **`tailwindcss-animate`** supplies keyframe helpers for Tailwind utilities.
- **`framer-motion`** adds JS-driven animations that complement the pure-CSS keyframes.

### Generated / Auxiliary CSS

Coverage-report CSS (`coverage/lcov-report/*.css`) is generated and therefore **excluded from manual documentation and linting rules**.

## Blog Article Styling

Blog posts (MDX files under `app/blog/**`) leverage several layers of the styling stack:

1. **Global Prose Rules** – The `@tailwindcss/typography` extension in `tailwind.config.js` ensures headings, lists, blockquotes, etc. get consistent spacing and font sizes. Global overrides in `app/globals.css` further adjust colors to match light/dark themes.
2. **Code Blocks** – `components/ui/code-block/**` together with `app/code-blocks.css` and `prism.css` provide syntax highlighting that automatically picks up the current theme.
3. **Responsive Images & Embeds** – Posts inherit `max-width: none` from the prose rules, allowing wide visuals without side-scroll. Utility classes (`prose-img:rounded-md`, etc.) are added in MDX content for fine control.
4. **MDX Components** – Custom React components used in articles (e.g., Tabs, Terminal) pull their own scoped CSS while still inheriting root CSS variables.

This layered approach means **blog articles share the global design language** while retaining flexibility for rich interactive content.
