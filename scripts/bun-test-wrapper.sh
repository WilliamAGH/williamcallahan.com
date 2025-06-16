#!/bin/bash
# Wrapper script to prevent direct bun test usage
# This can be aliased to 'bun' in your shell

if [ "$1" = "test" ] && [ "$#" -eq 1 ]; then
  echo "⚠️  ERROR: Do not use 'bun test' directly!"
  echo ""
  echo "This project uses both Bun and Jest test runners."
  echo "Running 'bun test' will fail on Jest test files."
  echo ""
  echo "Use these commands instead:"
  echo "  npm run test:bun    # Run only Bun tests"
  echo "  npm run test:jest   # Run only Jest tests"
  echo "  npm run test:all    # Run both test suites"
  echo ""
  echo "Or specify specific files:"
  echo "  bun test __tests__/specific-file.test.ts"
  exit 1
else
  # Pass through to actual bun command
  command bun "$@"
fi