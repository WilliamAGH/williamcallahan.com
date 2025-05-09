#!/bin/bash
/*
 * This script is used to run the tests with HappyDOM and Testing Library setup
 * It is used to test the server-side cache by providing a mock implementation of the NodeCache class which is used in the lib/server-cache.ts file and is used to cache the results of the getLogo function
 */
echo "Running tests with HappyDOM and Testing Library setup..."
bun test --preload ./happydom.ts --preload ./__tests__/lib/setup/testing-library.ts "$@"

exit $? # Exit with the status code from bun test