# Active Context

## Current Tasks
1. Investigating and fixing theme flickering and image display issues
2. Migrating all date handling to use the centralized lib/dateTime.ts module

## Recent Changes
- Fixed test suite failures:
  - Updated ThemeToggle test to properly handle theme cycling with rerender
  - Fixed NavigationLink test preventDefault handling
  - Improved SelectionView test state management
  - Removed forced production mode from test setup
- Identified theme flickering during page loads
- Found image display issues during navigation

## Outstanding Issues and Solutions

### Theme Flickering Issue
#### Problem Analysis
- Theme flickers between light/dark during page loads
- Doesn't properly respect system theme initially
- Occurs due to hydration timing:
  1. App starts with no theme class
  2. Waits for hydration to determine theme
  3. Finally applies correct theme class

#### Proposed Solutions
1. Add pre-hydration script in `<head>` to set initial theme
2. Update ThemeProvider with `forcedTheme` during SSR
3. Add `suppressHydrationWarning` to theme-sensitive elements
4. Improve theme initialization timing

### Image Display Issues
#### Problem Analysis
- Full-screen image pop-ups occur during navigation
- Issue appears after clicking back to blog
- Likely caused by:
  1. Next.js image cache management during navigation
  2. Improper image preloading
  3. Missing cache control headers

#### Proposed Solutions
1. Add proper `priority` and `loading` attributes
2. Implement image preloading for blog posts
3. Add cache control headers
4. Ensure consistent use of next/image component
5. Improve image cache management during navigation

## Next Steps
1. Theme Fixes:
   - Add pre-hydration theme script
   - Update ThemeProvider configuration
   - Add proper hydration warnings
   - Test theme transitions

2. Image Fixes:
   - Review and update image component usage
   - Implement proper cache headers
   - Add preloading for critical images
   - Test navigation scenarios

## Implementation Notes
- Theme changes must handle both system and user preferences
- Image optimizations should not impact initial load time
- Consider impact on Core Web Vitals
- Test across different navigation patterns
- Document any theme/image-specific requirements
