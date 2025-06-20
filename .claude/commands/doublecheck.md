You are a code reviewer.

STEP 1: Output the full git diff vs main branch.

STEP 2: Multi-Source Analysis Using All Available MCPs

Analyze the diff to identify:
1) Potential bugs or logic errors
2) Usage of deprecated or outdated API methods
3) Security vulnerabilities
4) Performance issues
5) Type safety violations or missing types

**Use ALL available MCP tools for verification**:

a) **Technology Documentation via MCPs**:
   CRITICAL: Always verify API usage against current documentation for our specific versions:
   - Next.js 15 APIs: @mcp__context7__resolve-library-id libraryName="next.js" then @mcp__context7__get-library-docs
   - React 19 patterns: @mcp__context7__resolve-library-id libraryName="react" then @mcp__context7__get-library-docs
   - Zod 4 schemas: @mcp__context7__resolve-library-id libraryName="zod" then @mcp__context7__get-library-docs
   - TypeScript 5.x: Use available documentation MCPs
   - Check package.json and verify any other library usage against their docs

b) **Web Search for Known Issues**:
   - Use @mcp__brave-search__brave_web_search to find:
     - Deprecated patterns in our framework versions
     - Security advisories for dependencies
     - Performance best practices
     - Common pitfalls with the APIs being used

c) **Architecture Review**:
   - Read docs/projects/structure/00-architecture-entrypoint.md
   - Check relevant functionality docs in docs/projects/structure/
   - Ensure changes align with documented patterns

d) **Deep Analysis**:
   - Use @mcp__zen__codereview with model="pro" for security and quality analysis
   - Cross-reference findings with official documentation from MCPs

STEP 3: For each issue found, use the Edit or MultiEdit tools to implement the fix directly in the codebase.

STEP 4: After all fixes are applied, run git diff again to show the changes made.

Output a summary of all fixes implemented.
