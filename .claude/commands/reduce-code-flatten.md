## Senior Developer's Guide to Code Reduction

### PRIMARY RULE: REDUCE TOTAL LINE COUNT

**FLATTENING = FEWER LINES OF CODE WITH HIGH READABILITY**

- The file MUST have fewer lines after flattening than before
- If your changes add lines, you're doing it wrong
- Every edit should decrease the total line count
- **BUT** never sacrifice clarity to the point where code becomes cryptic
- Find the balance: concise yet comprehensible

### Primary Goal & Core Constraints

- **Goal**: The overarching objective is to maintain a lean and manageable codebase by keeping all files under a **500-line limit**. This refactoring guide is a key tool in achieving that goal.
- **Critical Constraint - No New Files**: Nothing in this guide should be interpreted as permission to create new files to meet the line-count goal. File creation is strictly forbidden unless **explicitly and directly requested by the user**. Do not assume consent.
- **Critical Constraint - Line Count Must Decrease**: Creating helper functions, extracting methods, or adding abstractions typically INCREASES line count. Avoid these patterns unless they eliminate significant duplication.

This guide provides a set of targeted refactoring techniques for senior developers tasked with reducing file size (line count) without altering functionality. The primary objective is to decrease code verbosity while enhancing clarity and maintaining the project's strict quality standards.

### What Flattening is NOT

**DO NOT do these things when flattening:**

- ❌ Extract helper functions (adds lines)
- ❌ Create separate utility functions (adds lines)
- ❌ Split code into multiple functions "for clarity" (adds lines)
- ❌ Add abstraction layers (adds lines)
- ❌ Create new types or interfaces (adds lines)
- ❌ Expand compressed logic "for readability" (adds lines)

**INSTEAD, focus on:**

- ✅ Removing redundant comments
- ✅ Consolidating duplicate logic
- ✅ Using concise syntax (ternary, optional chaining, etc.)
- ✅ Combining similar operations
- ✅ Eliminating unnecessary variables
- ✅ Reducing verbose error handling
- ✅ Simplifying overly detailed JSDoc

### Mandatory Pre-Refactoring Workflow

Before any code is changed, a rigorous analysis and planning phase is mandatory. This ensures that all decisions are data-driven and risk-averse.

**Phase 1: Comprehensive Analysis & Information Gathering**

1. **Tool-Driven Research**: You are required to use all available tools to build complete context.
   - **MCPs (`@mcp_...`)**: Utilize tools like `@mcp_context7_resolve-library-id` and `@mcp_context7_get-library-docs` to fetch the most current documentation for all relevant libraries and dependencies.
   - **Web Search (`@web`)**: Perform web searches for implementation patterns, potential performance implications of changes, and community best practices.
2. **Total Context Review**: NEVER make assumptions. You must read and understand all related code, types, and documentation.
   - Read the actual source code of imported functions.
   - Review all relevant type definitions in the `types/` directory.
   - Examine existing test cases to understand expected behavior.
3. **Zero Boilerplate**: The use of generic, copy-pasted, or boilerplate code is strictly forbidden. Every line of code must be intentional and tailored to its specific context.

**Phase 2: Strategic Planning & Contrarian Review**

1. **Formulate an Initial Plan**: After your comprehensive analysis, create a detailed, step-by-step plan for refactoring. Document which techniques you will apply and why.
2. **Deep Thinking Revision**: Re-evaluate your own plan. Use deep thinking to identify potential weaknesses, edge cases you might have missed, or alternative approaches that might be safer or more effective.
3. **Seek Contrarian Opinion**: Use the Zen MCP (`@mcp_zen_chat` or other relevant Zen tools) to challenge your revised plan. Frame your request for a contrarian viewpoint:
   > "Review this refactoring plan. My goal is to reduce code size without any risk of breaking changes. Act as a contrarian and identify what I might have missed, potential risks in my approach, and how this plan could be made even safer and more robust."

**Do not proceed to edit any code until this entire prerequisite workflow is complete.** All planning and analysis must be finished before implementation begins.

---

## 🔰 Kick-Off Recipe – Start Every Flattening Task the Same Way

### 1 Create a **Functionality Inventory** (WHAT the file does)

Fill a small table before touching code:

| Category            | Questions to answer                          |
| ------------------- | -------------------------------------------- |
| **Public API**      | What is exported? Params & return types?     |
| **Side-effects**    | Disk writes? Logs? DOM tweaks? Global state? |
| **Data Flow**       | Which modules/types are consumed & produced? |
| **Branching**       | List every conditional and what it checks.   |
| **Collections**     | Loops / map / filter / reduce targets?       |
| **Errors**          | try/catch, error codes, expected failures?   |
| **I/O & Network**   | fetch, db, S3, fs, etc.?                     |
| **Config Flags**    | Env vars, feature toggles, runtime flags?    |
| **Types & Schemas** | Local aliases, interfaces, Zod, enums?       |
| **Domain Nouns**    | Business concepts used repeatedly?           |

_(1-line per row, no judgement yet)_

### 2 Run the **First-Principles Search Loop** (WHERE else is it?)

For **each** inventory bullet:

1. **Exact `rg` grep** → literal symbol search.
2. **Semantic search** → ask "Where is X parsed/validated?"
3. **Review neighbours** → duplicate? SOC violation? Canonical impl?
4. **Action tag** → KEEP / MERGE / MOVE / DELETE.
5. **Brainstorm reductions** only after every tag is set.

Repeat until every item has a clear fate backed by evidence.

### 3 Lock in with a **Refactor Prompt Template**

```text
System: "ZERO-TEMPERATURE refactor – file <path>."
User:
1. Here is the inventory + action map.
2. Apply reduce-code-flatten rules (line count must fall).
3. No new files, env vars, @ts-ignore, eslint-disable.
4. After edits run `bun run validate` → 0 errors/warnings.
5. Output minimal `edit_file` operations only.
```

Use this exact sequence every time to ensure consistency with project rules.

---

### Core Principles

1. **Functionality is Sacred**: The foremost rule is to preserve 100% of the existing functionality. No features, behaviors, or edge cases should be changed or removed.
2. **Clarity Over Brevity**: While the goal is to reduce lines, it must not come at the cost of readability. Code should become more expressive, not more cryptic.
3. **Strict Compliance**: All refactoring must adhere to the project's development standards.
4. **JSDoc Comments Remain Mandatory**: Every file **must** continue to include concise JSDoc comments _after_ refactoring.
   - A file-level JSDoc comment is required and should appear **above all package imports**.
   - All exported functions (and any complex internal helpers) require their own JSDoc block.
   - Comments must be **specific and succinct**—single phrases or short fragments are preferred over full sentences.
     / - Removing or substantially diluting existing JSDoc is **prohibited**; update wording only when it improves accuracy or brevity.

### Mandatory Project Compliance

Before and after any change, you must ensure full compliance with the project's ZERO TEMPERATURE development environment.

- **Master Rules**: All changes must conform to the master project rules outlined in [`CLAUDE.md`](../../CLAUDE.md).
- **Type Safety & Linting**: All code must adhere to the strict type safety and formatting standards detailed in [`docs/projects/structure/linting-formatting.md`](../../docs/projects/structure/linting-formatting.md).
- **Validation**: Every change must be validated. The command `bun run validate` must pass with **zero errors and zero warnings**.

---

### High-Impact Refactoring Techniques

#### 1. Leverage Optional Chaining and Nullish Coalescing

```typescript
// Before (5 lines)
let value;
if (obj && obj.prop && obj.prop.nested) {
  value = obj.prop.nested;
} else {
  value = "default";
}

// After (1 line)
const value = obj?.prop?.nested ?? "default";
```

#### 2. Use Destructuring with Default Values

```typescript
// Before (4 lines)
const name = props.name || "Anonymous";
const age = props.age || 0;
const city = props.city || "Unknown";
const country = props.country || "Unknown";

// After (1 line)
const { name = "Anonymous", age = 0, city = "Unknown", country = "Unknown" } = props;
```

#### 3. Replace Conditional Returns with Logical Operators

```typescript
// Before (5 lines)
function getDisplayName(user) {
  if (!user) {
    return "Guest";
  }
  return user.name;
}

// After (1 line)
const getDisplayName = user => user?.name || "Guest";
```

#### 4. Combine Array Operations

```typescript
// Before (4 lines)
const filtered = items.filter(item => item.active);
const mapped = filtered.map(item => item.value);
const sorted = mapped.sort((a, b) => a - b);
const result = sorted.slice(0, 10);

// After (1 line)
const result = items
  .filter(item => item.active)
  .map(item => item.value)
  .sort((a, b) => a - b)
  .slice(0, 10);
```

#### 5. Use Object Property Shorthand and Spread Syntax

```typescript
// Before (6 lines)
function createUser(name, email, age) {
  return {
    name: name,
    email: email,
    age: age,
    createdAt: Date.now(),
  };
}

// After (1 line)
const createUser = (name, email, age) => ({ name, email, age, createdAt: Date.now() });
```

#### 6. Replace Switch Statements with Object Lookups

```typescript
// Before (12 lines)
function getStatusColor(status) {
  switch (status) {
    case "active":
      return "green";
    case "pending":
      return "yellow";
    case "inactive":
      return "red";
    default:
      return "gray";
  }
}

// After (2 lines)
const statusColors = { active: "green", pending: "yellow", inactive: "red" };
const getStatusColor = status => statusColors[status] || "gray";
```

#### 7. Use Template Literals for String Building

```typescript
// Before (4 lines)
const message = "Hello, " + user.name + "! ";
const fullMessage = message + "You have " + count + " messages.";
const finalMessage = fullMessage + " Last login: " + lastLogin;
return finalMessage;

// After (1 line)
return `Hello, ${user.name}! You have ${count} messages. Last login: ${lastLogin}`;
```

#### 8. Consolidate Similar Conditional Logic

```typescript
// Before (8 lines)
if (type === "admin" || type === "superadmin") {
  permissions.push("delete");
}
if (type === "admin" || type === "superadmin") {
  permissions.push("edit");
}
if (type === "admin" || type === "superadmin" || type === "moderator") {
  permissions.push("view");
}

// After (3 lines)
const isAdmin = ["admin", "superadmin"].includes(type);
if (isAdmin) permissions.push("delete", "edit");
if (isAdmin || type === "moderator") permissions.push("view");
```

#### 9. Use Array Methods Instead of Loops

```typescript
// Before (6 lines)
const results = [];
for (let i = 0; i < items.length; i++) {
  if (items[i].price > 100) {
    results.push(items[i].name);
  }
}

// After (1 line)
const results = items.filter(item => item.price > 100).map(item => item.name);
```

#### 10. Combine Guard Clauses and Early Returns

```typescript
// Before (10 lines)
function processUser(user) {
  if (user) {
    if (user.active) {
      if (user.verified) {
        // actual logic
        return transformUser(user);
      }
    }
  }
  return null;
}

// After (4 lines)
function processUser(user) {
  if (!user?.active || !user?.verified) return null;
  return transformUser(user);
}
```

---

## Strategic Application

These techniques are powerful but require professional judgment.

### When to Apply

- When the refactored code is demonstrably cleaner and easier to understand.
- When you can remove intermediate variables without losing context.
- When consolidating logic clarifies the code's intent.

### When to Exercise Caution

- **Complex Logic**: Do not compress complex business logic into a dense one-liner that obscures its function.
- **Debugging Difficulty**: If a change makes stepping through the code with a debugger significantly harder, reconsider.
- **Team Conventions**: While these techniques are encouraged, consistency with the surrounding codebase is key.

---

## Real Example: What Flattening Actually Looks Like

**BEFORE: 25 lines**

```typescript
/**
 * Process user authentication
 * This function handles user authentication by checking credentials
 * @param username The username to authenticate
 * @param password The password to check
 * @returns true if authenticated, false otherwise
 */
function authenticateUser(username: string, password: string): boolean {
  // Check if username exists
  if (!username) {
    console.error("Username is required");
    return false;
  }

  // Check if password exists
  if (!password) {
    console.error("Password is required");
    return false;
  }

  // Validate credentials
  const isValid = checkCredentials(username, password);

  return isValid;
}
```

**AFTER: 5 lines**

```typescript
/** Authenticate user credentials */
function authenticateUser(username: string, password: string): boolean {
  if (!username || !password) return (console.error("Credentials required"), false);
  return checkCredentials(username, password);
}
```

**Result: 20 lines removed (80% reduction)**

## Senior Developer's Pre-Commit Checklist

Before committing any code reduction refactoring, confirm the following:

- [ ] **Line Count Reduced?** Does the file have FEWER total lines than before?
- [ ] **Functionality Unchanged?** Have you manually verified that the behavior is identical?
- [ ] **Readability Maintained?** Is the new code as easy or easier to understand for another developer?
- [ ] **Project Rules Followed?** Does the change comply with [`CLAUDE.md`](../../CLAUDE.md) and [`docs/projects/structure/linting-formatting.md`](../../docs/projects/structure/linting-formatting.md)?
- [ ] **JSDoc Comments Intact?** File-level and function-level JSDoc blocks are present, accurate, and succinct.
- [ ] **Validation Passed?** Did `bun run validate` complete with zero errors or warnings?
- [ ] **Is this truly better?** Or just fewer lines?

## Commit Instructions - ABSOLUTELY CRITICAL

**NEVER include AI/Claude attribution in commits:**

- ❌ 🤖 Generated with [Claude Code]
- ❌ Co-Authored-By: Claude <noreply@anthropic.com>
- ❌ Any other AI attribution or markers

**Commit Requirements:**

1. Clear, specific messages describing the exact optimization made
2. Small batches: 1-3 related files per commit maximum
3. NO generic messages like "reduce code" or "optimize"
4. Use conventional format: `refactor([scope]): specific description`

**Example commits:**

```bash
# Single file optimization
git add components/BlogList.tsx
git commit -m "refactor(blog): consolidate duplicate filter logic into single function"

# Related files in same domain
git add components/Search.tsx types/search.ts
git commit -m "refactor(search): remove redundant type definitions and simplify query builder"

# Never more than 3 files unless they're tiny related changes
git add utils/string.ts utils/number.ts utils/date.ts
git commit -m "refactor(utils): merge similar validation functions across utility modules"
```
