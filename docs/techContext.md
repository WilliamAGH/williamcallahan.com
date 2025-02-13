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
- Need to maintain high test coverage (target > 90%)
- Must handle both SSR and client-side rendering scenarios
- Image processing requires specific test scenarios
- Terminal component has complex state management
- SEO requirements demand thorough metadata testing
- Use real browser functionality when possible
- Use real file system operations when feasible
- Analytics tracking needs comprehensive event coverage

## Testing Requirements
1. Component Testing
   - Use real data and behavior where possible
   - Minimize external dependency mocking
   - Test user interactions thoroughly
   - Verify rendered output
   - Handle async operations properly

2. Utility Testing
   - Unit tests with real data
   - Integration tests for complex operations
   - Use real file system and API calls when safe
   - Test error scenarios thoroughly

3. Coverage Goals
   - Statements: > 90%
   - Branches: > 85%
   - Functions: > 90%
   - Lines: > 90%
