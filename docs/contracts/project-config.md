---
title: "Project Configuration"
description: "Stack details, directory map, and verification commands"
---

# Project Configuration

See `AGENTS.md` ([CFG1], [VC1]).

## Configuration

```yaml
REPO_NAME: williamcallahan.com
GITHUB_URL: https://github.com/WilliamAGH/williamcallahan.com
DEFAULT_BRANCH: dev

PACKAGE_MANAGER: bun
LOCKFILE: bun.lock
PACKAGE_MANAGER_INSTALL: bun install
PACKAGE_MANAGER_ADD: bun add
PACKAGE_MANAGER_REMOVE: bun remove

# Stack
FRAMEWORK: Next.js
RUNTIME: Node.js

# Testing
TEST_RUNNER: Jest
JEST_CONFIG_PATH: config/jest/config.ts

# Code quality
LINTER: Oxlint + ESLint
FORMATTER: Biome + Prettier
TYPE_CHECKER: TypeScript (tsc)
SCHEMA_LIB: Zod (see zod/v4 usage in src/types/schemas/)

# Source directories (inside src/)
APP_DIR: src/app/
COMPONENTS_DIR: src/components/
LIB_DIR: src/lib/
HOOKS_DIR: src/hooks/
TYPES_DIR: src/types/
SCHEMAS_DIR: src/types/schemas/
STYLES_DIR: src/styles/

# Root-level directories (outside src/)
CONFIG_DIR: config/
DATA_DIR: data/
DOCS_DIR: docs/
PUBLIC_DIR: public/
SCRIPTS_DIR: scripts/

# CI/CD & deployment
CI_PROVIDER: GitHub Actions
CDN: Cloudflare
PRODUCTION_URL: https://williamcallahan.com
LOCAL_DEVELOPMENT_URL: http://localhost:3000

COMMON_COMMANDS:
  dev: bun run dev
  build: bun run build
  build_only: bun run build:only
  validate: bun run validate
  lint: bun run lint
  type_check: bun run type-check
  format: bun run format
  tests: bun run test
```

## Verification Commands

```bash
# Check current dependency versions
cat package.json | jq '.dependencies'

# Find files over ~400 LOC (warning threshold)
find . \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | awk '$1 > 400' | sort -n

# Search for existing functionality
grep -r "[keyword]" --include="*.ts" --include="*.tsx" .

# Validate the codebase
bun run validate

# Typecheck
bun run type-check

# Tests (never run `bun test` directly)
bun run test

# Review types for a domain
find src/types/ -name "*.ts" | xargs rg -n "[domain]"
```

### Search Strategies for "Update All Usages"

```bash
# Imports
grep -r "import.*Thing" --include="*.ts" --include="*.tsx" .

# Call sites
grep -r "thing(" --include="*.ts" --include="*.tsx" .

# Types
grep -r "Thing" --include="*.ts" --include="*.tsx" .

# Tests
grep -r "Thing" --include="*.test.ts" --include="*.spec.ts" .
```
