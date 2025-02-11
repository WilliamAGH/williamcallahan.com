# Technical Context

## Technologies Used
- Next.js with TypeScript
- Jest for testing framework
- React Testing Library for component testing
- Tailwind CSS for styling
- Node.js environment

## Development Setup
- Jest configuration with custom setup file (jest.setup.js)
- React Testing Library for component testing
- Coverage reporting enabled and configured
- TypeScript in strict mode
- ESLint for code quality
- Biome for formatting

## Technical Constraints
- CRITICAL: All tests MUST run in production mode (NODE_ENV=production)
- Need to maintain high test coverage (target > 90%)
- Must handle both SSR and client-side rendering scenarios
- Image processing requires specific test scenarios
- Terminal component has complex state management
- SEO requirements demand thorough metadata testing
- Browser-specific functionality needs mocking
- File system operations require careful testing approach
- Analytics tracking needs comprehensive event coverage

## Testing Requirements
1. Component Testing
   - Tests must run in production mode
   - Mock external dependencies
   - Test user interactions
   - Verify rendered output
   - Handle async operations

2. Utility Testing
   - Unit tests for pure functions
   - Integration tests for complex operations
   - Mock file system and API calls
   - Test error scenarios

3. Coverage Goals
   - Statements: > 90%
   - Branches: > 85%
   - Functions: > 90%
   - Lines: > 90%
