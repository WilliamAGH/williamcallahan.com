# Active Context

## Current Tasks
1. Migrating all date handling to use the centralized lib/dateTime.ts module
2. ✅ Fixed test suite failures related to React's act() in production mode

## Recent Changes
- Fixed test suite failures:
  - Updated ThemeToggle test to properly handle theme cycling with rerender
  - Fixed NavigationLink test preventDefault handling
  - Improved SelectionView test state management
  - Removed forced production mode from test setup
- Identified several components and files still using direct date manipulation
- Analyzed the codebase for non-compliant date handling
- Found dateTime.ts provides comprehensive Pacific timezone handling

## Outstanding Changes Needed

### Date Migration Tasks
#### Experience Card Component
- Location: components/ui/experience-card/experience-card.client.tsx
- Issue: Using raw ISO strings in dateTime attributes
- Fix: Need to use toISO() for proper timezone handling

#### Experience Data
- Location: data/experience.ts
- Issue: Hardcoded YYYY-MM-DD format dates
- Fix: Need to process through toISO() for consistent timezone handling
- Impact: Affects Schema.org metadata

#### Experience Types
- Location: types/experience.ts
- Issue: Basic string typing for dates
- Fix: Consider using PacificDateString type for consistency with blog system

#### Education Card Component
- Location: components/features/education/education-card.client.tsx
- Issue: Direct year display without formatting
- Fix: Consider using formatDisplay() for consistency

## Next Steps
1. Date Migration Tasks:
   - Update experience-card.client.tsx to use toISO()
   - Modify experience.ts data to process dates through toISO()
   - Update experience.ts types to use more specific date typing
   - Update education card to use formatDisplay()
   - Add tests to verify timezone handling
   - Update documentation to reflect changes

## Implementation Notes
- All dates must be handled in Pacific timezone
- Use toISO() for machine-readable dates (Schema.org, HTML attributes)
- Use formatDisplay() for human-readable dates
- Consider adding validation to ensure proper date format usage
- Test environment is now properly configured for React testing
- Maintain separation between test and production environments
- Document any environment-specific testing requirements
