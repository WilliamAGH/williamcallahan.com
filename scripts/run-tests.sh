#!/bin/bash
# This script is used to run the tests with HappyDOM and Testing Library setup
# It routes through `bun run test` so Vitest uses the project configuration.

echo "Running tests with HappyDOM and Testing Library setup..."
bun run test "$@"

exit $? # Exit with the status code from bun run test (Vitest)
