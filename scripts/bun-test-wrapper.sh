#!/bin/bash
# Wrapper script to prevent direct bun test usage
# This can be aliased to 'bun' in your shell

if [ "$1" = "test" ] && [ "$#" -eq 1 ]; then
  echo "ERROR: Do not use 'bun test' directly."
  echo ""
  echo "This project uses Vitest through npm/bun scripts."
  echo "Running 'bun test' bypasses the Vitest config."
  echo ""
  echo "Use these commands instead:"
  echo "  bun run test         # Run Vitest once"
  echo "  bun run test:watch   # Watch mode"
  echo "  bun run test:coverage"
  echo ""
  echo "Or specify files with Vitest:"
  echo "  bun run test -- __tests__/path/to/file.test.ts"
  exit 1
else
  # Pass through to actual bun command
  command bun "$@"
fi
