#!/bin/bash
# Run Bun tests from the bun directory

echo "Running Bun tests..."

# Simply run bun run test which will use the root configuration from package.json
# bun run test uses default
bun run test "$@"