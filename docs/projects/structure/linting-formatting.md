# Linting & Formatting Architecture

**Functionality:** `linting-formatting`

## Core Objective

Maintain consistent code quality, style, and formatting across the entire codebase through a comprehensive set of linting and formatting tools. The project uses a dual-tool approach with ESLint for JavaScript/TypeScript linting and Biome for formatting.

## Tool Overview

### Primary Tools

1. **ESLint** - JavaScript/TypeScript linting
   - Config: `eslint.config.ts` (Flat config format)
   - Version: 9.28.0
   - Primary responsibility: Code quality, best practices, React rules

2. **Biome** - Code formatting and additional linting
   - Config: `biome.json`
   - Primary responsibility: Code formatting, import organization
   - Complementary linting rules

3. **Stylelint** - CSS linting
   - Config: Inline in `package.json`
   - Extends: `stylelint-config-recommended`, `stylelint-config-tailwindcss`

### Supporting Tools

- **TypeScript** - Type checking via `tsc --noEmit`
- **Prettier** - Not used (replaced by Biome)
- **Husky + lint-staged** - Pre-commit hooks

## ESLint Configuration

### File: `eslint.config.ts`

```typescript
// Uses the new flat config format (ESLint 9+)
// Main sections:
1. Global ignores
2. Base configurations (JS, TypeScript)
3. React and Next.js rules
4. File-specific overrides
5. MDX support
```

### Key Configuration Sections

#### 1. TypeScript Project Setup

```typescript
{
  languageOptions: {
    parserOptions: {
      project: ['./tsconfig.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
}
```

**🔴 ISSUE**: The error shows `jest.config.ts` is not included in the TypeScript project. This needs to be fixed by either:

- Adding `jest.config.ts` to the `include` array in `tsconfig.json`
- Creating a separate TypeScript config override for config files
- Adding it to the ESLint config file patterns

#### 2. File-Specific Rules

- **Server Components** (`*.server.{ts,tsx}`): Disables React hooks rules
- **Client Components** (`*.client.{ts,tsx}`): Enables React hooks exhaustive-deps
- **Config Files**: Relaxed TypeScript rules for configuration files
- **Test Files**: Uses separate `tsconfig.jest.json` for test files
- **MDX Files**: Custom MDX processor with code block linting

#### 3. Global Restrictions

```typescript
"no-restricted-globals": [
  "error",
  { "name": "window", "message": "Use only in client components (*.client.tsx) or with proper checks" },
  { "name": "document", "message": "Use only in client components (*.client.tsx) or with proper checks" }
]
```

### Custom Type Definitions

**File: `types/eslint-custom-types.d.ts`**

- Provides TypeScript definitions for ESLint plugins
- Necessary for modules without built-in types
- Includes MDX plugin type definitions

## Biome Configuration

### File: `biome.json`

```json
{
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "a11y": {
        "useAltText": "off",
        "noBlankTarget": "off"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

### Biome Overrides

- Config files: Disables `noExplicitAny` and `noForEach`
- Test files: Disables import organization and `noExplicitAny`

## VSCode Integration

### File: `.vscode/settings.json`

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": false,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports": "never"
  },
  "eslint.validate": [
    "javascript", "javascriptreact", 
    "typescript", "typescriptreact", 
    "html", "vue", "markdown"
  ]
}
```

## Scripts & Commands

### Package.json Scripts

```json
{
  "lint": "eslint . --config eslint.config.ts",
  "lint:errors": "eslint . --config eslint.config.ts --quiet",
  "lint:css": "stylelint --fix 'app/**/*.css' 'styles/**/*.css'",
  "biome:check": "biome check .",
  "biome:format": "biome format --write .",
  "biome:lint": "biome lint .",
  "type-check": "tsc --noEmit",
  "validate": "bun run lint && bun run type-check"
}
```

## Pre-commit Hooks

### lint-staged Configuration

```json
{
  "*.{js,jsx,ts,tsx,mdx}": [
    "eslint --config eslint.config.ts --fix"
  ]
}
```

## Known Issues & Solutions

### 1. Jest Config TypeScript Error

**Error**: "ESLint was configured to run on `jest.config.ts` using `parserOptions.project`: tsconfig.json. However, that TSConfig does not include this file."

**Root Cause**: Configuration files are outside the main TypeScript project scope but ESLint tries to apply type-aware linting to them.

**Implemented Solution**: The ESLint configuration now has a dedicated section for all configuration files that disables type-aware linting:

```typescript
// Configuration files - TypeScript
{
  files: [
    "eslint.config.ts",
    "*.config.ts",
    "config/jest/*.ts",
    "config/**/*.ts",
    "next.config.ts",
    "tailwind.config.ts",
    "middleware.ts",
    "instrumentation.ts",
    "sentry.*.config.ts",
    "jest.config.ts",
  ],
  languageOptions: {
    globals: {
      ...globals.node,
    },
    parserOptions: {
      project: null,  // Disable type-aware linting for config files
    }
  },
  rules: {
    ...tseslint.configs.disableTypeChecked.rules,
    // Additional relaxed rules for config files
  }
}
```

This approach:

- Keeps configuration files in TypeScript for better type safety
- Avoids the overhead of type-aware linting for config files
- Maintains a clear separation between application code and configuration

### 2. Dual Tool Overlap

ESLint and Biome have overlapping responsibilities:

- **Import organization**: Both tools can organize imports
- **Formatting**: Biome handles formatting, ESLint should not
- **Linting**: Both provide linting rules

**Current Resolution**:

- Biome handles all formatting
- ESLint focuses on code quality rules
- Import organization is handled by Biome

### 3. MDX Files

MDX files require special handling:

- Custom processor for MDX content
- Separate rules for code blocks within MDX
- Type checking disabled for MDX files

## Best Practices

1. **Run validation before commits**: Use `bun run validate`
2. **Use editor integration**: Install Biome and ESLint extensions
3. **Fix issues incrementally**: Use `--quiet` flag to focus on errors first
4. **Configure IDE**: Ensure VSCode settings match project configuration
5. **Keep tools updated**: Regularly update linting dependencies

## Integration Points

- **CI/CD**: Linting runs in GitHub Actions
- **Pre-commit**: Husky runs lint-staged
- **Editor**: VSCode configured for real-time feedback
- **Testing**: Separate TypeScript config for tests

## Future Improvements

1. **Consolidate Tools**
   - Consider migrating fully to Biome when it reaches feature parity
   - Reduce configuration complexity

2. **Performance**
   - Implement caching for ESLint
   - Use Biome's built-in performance optimizations

3. **Documentation**
   - Add inline documentation for complex rules
   - Create migration guide for new developers

4. **Automation**
   - Auto-fix more issues on save
   - Add more specific file patterns for optimization
