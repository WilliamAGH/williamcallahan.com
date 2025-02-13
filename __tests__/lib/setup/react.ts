// __tests__/lib/setup/react.ts

/**
 * React Testing Setup
 *
 * This file sets up React-specific test configurations and utilities.
 * It must run after all other test setup files.
 */

import { configure } from '@testing-library/react';
import '@testing-library/jest-dom';

// Configure React Testing Library
configure({
    // Use data-testid for querying elements
    testIdAttribute: 'data-testid',
    // Add a custom wait time for async operations
    asyncUtilTimeout: 1000,
    // Throw helpful suggestions when queries fail
    throwSuggestions: true,
});
