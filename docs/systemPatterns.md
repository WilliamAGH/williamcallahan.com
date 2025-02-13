# System Patterns

## Testing Architecture
1. Component Testing Strategy
   - Use React Testing Library for component tests
   - Follow user-centric testing approach
   - Use real data and behavior where possible
   - Test both success and error states
   - Verify accessibility requirements
   - Test responsive behaviors
   - Minimize mocking when feasible

2. Utility Testing Patterns
   - Pure function unit tests with real data
   - Integration tests for complex operations
   - Prefer real implementations over mocks
   - Error boundary testing
   - Edge case coverage

3. Image Processing Tests
   - Mock image loading/processing
   - Test transformation logic
   - Verify cache operations
   - Test error scenarios
   - Handle different image formats
   - Test optimization logic

4. Terminal Testing Strategy
   - Mock user input/output
   - Test state transitions
   - Verify command execution
   - Test selection behavior
   - Handle keyboard events
   - Test history management

5. SEO Testing Patterns
   - Validate metadata generation
   - Test schema construction
   - Verify OpenGraph properties
   - Test dynamic content
   - Validate structured data
   - Test meta tag generation

## Key Technical Decisions
1. Testing Framework
   - Jest as primary test runner
   - React Testing Library for components
   - Custom test utilities in lib/test
   - Snapshot testing when appropriate
   - Coverage reporting configuration
   - Must support production mode testing

2. Testing Strategy
   - Use real APIs when possible
   - Use real file system operations when safe
   - Minimize browser API mocking
   - Use real date/time operations when feasible
   - Prefer real data over mock data
   - Mock only when necessary

3. Test Organization
   - Mirror source structure in __tests__
   - Separate test utilities
   - Shared test fixtures
   - Common test setup patterns
   - Production environment setup

4. Coverage Requirements
   - Focus on critical paths
   - Comprehensive error handling
   - Edge case coverage
   - Integration test coverage

## Best Practices
1. Test File Structure
   - Clear test descriptions
   - Organized test suites
   - Proper setup/teardown
   - Isolated test cases
   - Production mode compatibility

2. Mocking Guidelines
   - Mock at appropriate level
   - Reset mocks between tests
   - Document mock behavior
   - Verify mock calls
   - Ensure production compatibility

3. Assertion Patterns
   - Clear error messages
   - Specific assertions
   - Avoid test interdependence
   - Proper async handling
   - Production-safe assertions
