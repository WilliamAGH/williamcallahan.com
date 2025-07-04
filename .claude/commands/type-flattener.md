Comprehensive type safety consolidation and deduplication workflow.

Arguments: [optional: specific type file/domain to focus on, e.g., "bookmark", "seo", "features/blog"]

STEP 0: Pre-flight Health Check
Before ANY changes, ensure clean working environment:
a) Run: bun run validate

- If ANY linting errors, warnings, or issues exist, fix them ALL first
- Use @full-lint command if needed
b) Run: bun run test
- If ANY tests fail, fix them ALL first
- Ensure 100% test pass rate
c) Only proceed once both commands report ZERO issues

STEP 1: Scope Definition & Context Gathering
a) If type file/domain provided in $ARGUMENTS:

- Identify the specific type file(s) to focus on
- Use Grep to find ALL related type definitions across types/ and *.d.ts files
- Search for similar/related naming patterns (e.g., "Bookmark", "BookmarkType", "IBookmark")
b) If no arguments provided:
- Scan entire types/ directory recursively
- Create comprehensive inventory of all type definitions

STEP 2: Documentation Analysis (Run in parallel with Task agents)
For each type domain being analyzed:
a) Read docs/projects/structure/00-architecture-entrypoint.md to understand overall architecture
b) Find related functionality documentation in docs/projects/structure/<functionality>.md
c) Read any associated .mmd Mermaid diagrams for data flow understanding
d) Use @mcp__zen__analyze with model="pro" on documentation to understand:

- The intended purpose of each type
- Relationships between types
- Domain boundaries and responsibilities

STEP 3: Type Discovery & Mapping with Framework Context
Use ALL available MCP tools for comprehensive analysis:

a) **Gather TypeScript Best Practices**:

- Use available TypeScript documentation MCPs for v5.x patterns
- @mcp__context7__resolve-library-id libraryName="typescript" then @mcp__context7__get-library-docs topic="types"
- @mcp__brave-search__brave_web_search for "TypeScript 5 type organization best practices"
- Understand current patterns for type exports and organization

b) **Framework-Specific Type Patterns**:

- Next.js 15 types: @mcp__context7__resolve-library-id libraryName="next.js" then @mcp__context7__get-library-docs topic="typescript"
- React 19 types: @mcp__context7__resolve-library-id libraryName="react" then @mcp__context7__get-library-docs topic="typescript"
- Zod 4 integration: @mcp__context7__resolve-library-id libraryName="zod" then @mcp__context7__get-library-docs

c) **Deep Analysis with Context**:
   Use @mcp__zen__thinkdeep with model="pro" and thinking_mode="max" including:

- All type definitions found
- Framework documentation insights
- Best practices from web search

   Analyze for:

- List all type definitions found
- Identify potential duplicates by analyzing:
  - Similar names (e.g., BookmarkType vs Bookmark)
  - Similar structure (matching properties)
  - Similar imports/usage patterns
- For each potential duplicate set:
  - Document exact file locations
  - List all properties and their types
  - Note any subtle differences
- Identify circular import risks:
  - Trace import chains
  - Flag any circular dependencies
  - Plan resolution strategy based on TypeScript best practices

STEP 4: Consumer Analysis (CRITICAL - Never skip this!)
For EACH potential duplicate type:
a) Use Grep to find ALL files importing/using the type
b) Create detailed usage map:

- Component files using the type
- API routes using the type
- Utility functions using the type
- Test files using the type
c) Document the exact import statements and usage patterns
d) Use TodoWrite to create a mapping task for each consumer

STEP 5: Zod Schema Analysis
For types that could benefit from runtime validation:
a) Check if Zod schemas already exist in lib/schemas/
b) Identify which types should have Zod schemas but don't
c) For existing schemas, check if they match their TypeScript counterparts
d) Plan schema consolidation alongside type consolidation

STEP 6: Create Consolidation Plan
Use TodoWrite to create detailed action items:
a) Group similar types and identify the "canonical" version to keep
b) For each duplicate to be removed:

- List ALL files that need import updates
- Specify exact changes needed
- Order changes to avoid breaking imports
c) Include Zod schema updates in the plan
d) Flag any breaking changes that might affect:
- API contracts
- External consumers
- Test expectations

STEP 7: Implementation Phase
For EACH consolidation task (mark as in_progress before starting):
a) Start with the deepest dependencies first (types used by other types)
b) For each consumer file:

- Use Read to understand current usage
- Use Edit/MultiEdit to update imports
- Update any type annotations
- Ensure no type errors introduced
c) After updating ALL consumers of a duplicate type:
- Run: bun run validate
- Fix any new issues immediately
- Only then mark the task as completed

STEP 8: Type File Cleanup
Only AFTER all consumers are updated:
a) Remove duplicate type definitions
b) Consolidate related types into appropriate files
c) Update barrel exports in index files
d) Ensure proper export structure

STEP 9: Zod Schema Updates
If runtime validation needed:
a) Create/update Zod schemas for consolidated types
b) Update any validation logic to use new schemas
c) Ensure schema exports align with type exports

STEP 10: Circular Dependency Resolution
If circular imports detected:
a) Identify the cycle
b) Extract shared types to a common file
c) Update all imports to break the cycle
d) Verify no new cycles introduced

STEP 11: Documentation Updates
Update all relevant documentation:
a) Update type references in docs/projects/structure/<functionality>.md files
b) Update docs/projects/file-overview-map.md with any new type organization
c) Update any code examples in documentation
d) Ensure documentation matches new type structure

STEP 12: Comprehensive Testing
After ALL changes:
a) Run: bun run validate

- Must show ZERO errors, warnings, or issues
b) Run: bun run test
- Must show 100% test pass rate
c) If ANY issues, fix them before proceeding

STEP 13: Final Verification with Deep Analysis
Use @mcp__zen__codereview with model="pro" and review_type="full" on:
a) All modified type files
b) A sample of consumer files
c) Any new Zod schemas
Ensure no regressions or missed updates

STEP 14: Summary Report
Generate comprehensive report including:
a) Types consolidated/removed
b) Number of files updated
c) Circular dependencies resolved
d) Zod schemas added/updated
e) Any remaining type safety concerns
f) Recommendations for future type organization

CRITICAL RULES:

1. NEVER remove a type until ALL its consumers are updated
2. ALWAYS run validation after each major change
3. ALWAYS ensure 100% test pass rate before and after
4. NEVER break existing functionality in pursuit of "cleaner" types
5. ALWAYS update documentation to match code changes

Output final summary with:

- Total duplicates found and resolved
- Files modified count
- Tests status (must be 100% passing)
- Validation status (must be zero issues)
- Any follow-up recommendations
