/**
 * Testing Library Import
 *
 * IMPORTANT: This file only imports @testing-library/jest-dom to add the matchers.
 * Configuration of React Testing Library must happen in jest.setup.ts after
 * the test environment is fully initialized.
 *
 * Order of operations:
 * 1. environment.ts - Sets up Node environment and env variables
 * 2. window.ts - Creates window mock with document object
 * 3. jest.setup.js - Sets up polyfills
 * 4. testing-library.ts (this file) - Adds jest-dom matchers
 * 5. jest.setup.ts - Sets up remaining test utilities and configures React Testing Library
 */

import '@testing-library/jest-dom';
