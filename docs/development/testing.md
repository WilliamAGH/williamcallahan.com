# Testing Guidelines and Common Issues

## Critical Warning
Testing React 18 components requires special attention to:
1. Focus management
2. Concurrent mode effects
3. State batching
4. Proper cleanup

See detailed examples and solutions below.

## React 18 + Jest Issues

### 1. Focus Management in JSDOM
- **Problem**: JSDOM doesn't properly handle focus management, causing tests to fail
- **Solution**: Skip focus tests or use a proper focus mock if focus testing is critical
- **Example**: See `commandInput.test.tsx` for how we handle this

### 2. Role Mismatches
- **Problem**: Using wrong ARIA roles in tests (e.g., `textbox` vs `searchbox`)
- **Solution**: Always check the actual component roles and match in tests
- **Example**: Terminal input uses `role="searchbox"`, not `role="textbox"`

### 3. React 18 Concurrent Mode
- **Problem**: State updates can be batched/reordered, breaking tests
- **Solution**: Use proper `act()` wrapping and avoid mixing sync/async tests
- **Example**: See how we separated sync state tests from async navigation tests

### 4. Test File Extensions
- **Problem**: Inconsistent file extensions (.ts vs .tsx) cause confusion
- **Solution**: Always use:
  - `.test.tsx` for React component tests
  - `.test.ts` for utility/helper tests
  - Never omit the `.test` part

### 5. Focus Element Mocking
- **Problem**: Global focus mocking interferes with component-specific focus
- **Solution**: Either:
  - Skip focus tests in components (preferred for most cases)
  - Create component-specific focus mocks
  - Use testing-library's built-in focus helpers

### 6. State Management & Update Cycles
- **Problem**: Components with context dependencies can cause infinite update loops
- **Solution**:
  - Use refs for stable references in components
  - Define handlers inside effects
  - Implement proper cleanup
- **Example**: Terminal component uses refs and effect-scoped handlers to prevent cycles:
```typescript
// Good: Handler defined in effect with refs
useEffect(() => {
  const handler = async (cmd) => {...};
  setHandleCommand(handler);
  return () => setHandleCommand(defaultHandler);
}, [setHandleCommand]);

// Bad: Handler recreated on every render
const handler = useCallback(async (cmd) => {...}, [dep1, dep2]);
useEffect(() => setHandleCommand(handler), [handler]);
```

## Best Practices

1. **Test Organization**
   - Group related tests under descriptive `describe` blocks
   - Use proper JSDoc comments for test files
   - Keep test files close to their components

2. **Real Data**
   - Use real application data in tests when possible
   - Mock only what's necessary (network calls, timers, etc.)
   - Keep test data in sync with application data

3. **Accessibility Testing**
   - Always test ARIA roles and labels
   - Use proper role queries from testing-library
   - Test keyboard interactions when relevant

4. **Error Cases**
   - Test both success and error paths
   - Include edge cases and boundary conditions
   - Document why certain tests are skipped

5. **Clean Up**
   - Always clean up after tests
   - Use proper beforeEach/afterEach hooks
   - Reset mocks and timers

6. **Context Testing**
   - Wrap components in proper context providers
   - Use stable references for context values
   - Test context updates and cleanup
   - Example:
```typescript
const wrapper = ({ children }) => (
  <TerminalProvider initialState={{ isReady: true }}>
    {children}
  </TerminalProvider>
);

it('handles context updates', () => {
  const { result } = renderHook(() => useTerminal(), { wrapper });
  // Test logic here
});
```

## Common Patterns

### Testing React Components
```typescript
describe('ComponentName', () => {
  // Props setup
  const defaultProps = {...};

  // Reset before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Group related tests
  describe('Functionality Name', () => {
    it('describes the test case', () => {
      // Arrange
      render(<Component {...defaultProps} />);

      // Act
      const element = screen.getByRole('...');

      // Assert
      expect(element).toBeInTheDocument();
    });
  });
});
```

### Testing Hooks
```typescript
describe('useHookName', () => {
  // Wrap tests in act() when updating state
  it('handles state updates', () => {
    const { result } = renderHook(() => useHookName());

    act(() => {
      result.current.someFunction();
    });

    expect(result.current.someValue).toBe(expectedValue);
  });
});
