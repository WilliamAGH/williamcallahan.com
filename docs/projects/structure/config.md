# Configuration Architecture

**Functionality:** `config`

## Core Objective

To provide centralized configuration management for the application, including environment variables, build tools, linting, formatting, and framework-specific settings. This ensures consistent behavior across development, testing, and production environments.

## 🚨 MODERN DEPENDENCY MANDATE (2025)

**This project FORBIDS polyfills** and enforces modern tooling practices:

### ❌ BANNED DEPENDENCIES

- `core-js`, `@babel/polyfill`, `react-app-polyfill`, `polyfill.io`
- `whatwg-fetch`, `isomorphic-fetch`, `cross-fetch`, `node-fetch`
- Any package that patches global objects or provides legacy browser support
- Any "kitchen-sink" polyfills for outdated runtimes

### ✅ REQUIRED MODERN STACK

- **Runtime**: Node 22 LTS (provides native `fetch`, `URL`, `TextEncoder`, etc.)
- **Framework**: Next.js 15 (uses native APIs and modern transpilation)
- **Package Manager**: Bun (for optimal performance and modern module resolution)
- **Documentation**: Always verify current patterns via Context7/DeepWiki MCPs

## Key Files and Responsibilities

### Environment Configuration

- **`types/env.d.ts`**: TypeScript type definitions for environment variables
  - Extends `NodeJS.ProcessEnv` interface for type safety
  - Currently defines only 2 variables: `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
  - **🟡 ISSUE**: Missing definitions for many other environment variables used in the application (AWS credentials, API keys, secrets, etc.)

### Build Tools Configuration

- **`.browserslistrc`**: Browser compatibility targets for CSS and JavaScript compilation
- **`tailwind.config.js`**: Tailwind CSS framework configuration
- **`tsconfig.json`**: TypeScript compiler options and path aliases

### Linting & Formatting Configuration

See [`linting-formatting.md`](./linting-formatting.md) for comprehensive documentation on:

- **`eslint.config.ts`**: ESLint linting rules and plugins
- **`stylelint.config.js`**: Stylelint configuration for CSS. Enforces consistent CSS coding style and prevents common errors.
- **`biome.json`**: Biome linter and formatter configuration
- **`types/eslint-custom-types.d.ts`**: TypeScript definitions for ESLint

### Framework Configuration

- **`next.config.ts`**: Next.js framework configuration
  - Image optimization settings
  - Webpack customizations
  - Environment variable exposure
- **`components.json`**: ShadCN UI component library configuration
- **`.hintrc`**: webhint web development linter configuration

### Development Tools

- **`.cursorrules`**: Cursor AI assistant configuration
- **`.env-example`**: Example environment variables template
- **`.gitignore`**: Git ignore patterns
- **`tools.config.js`**: Configuration for various development tools

### Testing Configuration

See [`testing-config.md`](./testing-config.md) for comprehensive testing configuration documentation.

### Package Management

- **`package.json`**: Dependencies and npm scripts (marked as `deps` functionality)
  - **CRITICAL**: Must never include polyfill packages - use modern alternatives only
  - **AUDIT**: Regular dependency review to remove legacy packages
- **`bun.lock`**: Bun package manager lockfile (marked as `deps` functionality)

## Configuration Hierarchy

1. **Environment Variables** (`process.env`)
   - Runtime configuration values
   - Secrets and API keys
   - Feature flags

2. **Build Configuration** (compile-time)
   - TypeScript settings
   - Bundler configuration
   - CSS processing

3. **Application Configuration** (runtime)
   - Framework settings
   - Route configuration
   - Middleware setup

## Security Considerations

### 🔴 CRITICAL Priority Issues

1. **Public Debug Endpoints in Production**
   - `app/api/sentry-example-api/route.ts` - Debug endpoint accessible in production
   - `app/api/cache/clear/route.ts` - No authentication allows anyone to clear cache (DoS)
   - **Fix**: Add environment checks to disable in production

2. **Exposed Secrets via Public Environment Variables**
   - `app/api/github-activity/refresh/route.ts` - Uses `NEXT_PUBLIC_GITHUB_REFRESH_SECRET`
   - Anyone can trigger expensive refresh operations
   - **Fix**: Move to server-only environment variable

### 🟡 MEDIUM Priority Issues

1. **Incomplete Environment Type Definitions** (`types/env.d.ts`)
   - Only 2 of many environment variables are typed
   - Missing: AWS credentials, API keys, debug secrets, Sentry DSN, etc.
   - **Fix**: Add comprehensive type definitions for all environment variables

2. **Configuration Inconsistencies**
   - `lib/constants.ts` - Cache durations mix milliseconds and seconds
   - `lib/constants.ts` - DuckDuckGo logo URLs are duplicated (hd === md)
   - Multiple routes have conflicting Next.js directives
   - **Fix**: Standardize units and remove duplicates

3. **Public Environment Variable Exposure**
   - `NEXT_PUBLIC_` prefixed variables are exposed to client
   - Risk of accidentally exposing secrets
   - **Fix**: Document and enforce naming conventions

## Best Practices

1. **Environment Variables**
   - Use `.env.local` for local development
   - Never commit `.env` files with real values
   - Validate required variables at startup

2. **Configuration Files**
   - Keep configuration close to code it affects
   - Use TypeScript for type-safe configuration
   - Document non-obvious settings

3. **Build Tools**
   - Regularly update tool configurations
   - Use consistent formatting across tools
   - Leverage shared configurations where possible

## Integration Points

- **Testing**: See [`testing-config.md`](./testing-config.md)
- **Deployment**: See deployment configuration in [`overview.md`](./overview.md#build--deployment)
- **Logging & Debugging**: See [`log-error-debug-handling.md`](./log-error-debug-handling.md)
- **Security**: Environment variables contain sensitive data (see Security Considerations above)

## Improvements Needed

1. **Immediate Security Fixes**
   - Disable debug endpoints in production environments
   - Move all secrets to server-only environment variables
   - Add authentication to administrative endpoints

2. **Type Safety**
   - Add comprehensive environment variable type definitions
   - Create runtime validation for required environment variables
   - Fix TypeScript configuration conflicts

3. **Configuration Consistency**
   - Standardize cache duration units to seconds
   - Fix duplicate configuration values
   - Resolve Next.js directive conflicts

4. **Tool Consolidation**
   - Consolidate overlapping linter configurations (ESLint + Biome)
   - Document all configuration options and their impacts
   - Add configuration validation at build time

5. **Documentation**
   - Create environment variable reference guide
   - Document security best practices
   - Add configuration troubleshooting guide
