---
title: "Code change policy contract"
usage: "Use whenever creating/modifying files: where to put code, when to create new components, and how to stay SRP compliant"
description: "Evergreen contract for change decisions (new file vs edit), repository structure, and component hierarchy; references rule IDs in `AGENTS.md`"
---

# Code Change Policy Contract

See `AGENTS.md` ([LOC1a-d], [MO1a-g], [FS1a-k], [ND1a-c]).

## Non-negotiables (applies to every change)

- **SRP only**: each new component/hook/utility has one reason to change ([MO1d]).
- **New feature → new file**; do not grow monoliths ([MO1b]).
- **No edits to >350 LOC files**; first split/retrofit ([LOC1c]).
- **Strict Boundaries**: Server Components fetch data; Client Components handle interactivity.
- **No DTOs**: Zod schemas define the API contracts; types are derived via `z.infer`.

## Decision matrix: create new file vs edit existing

Use this as a hard rule, not a suggestion.

| Situation                                                  | MUST do                                                             | MUST NOT do                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| New user-facing behavior (new page, new component variant) | Add a new, narrowly scoped component/file ([MO1b])                  | “Just add a prop” to a giant component ([MO1a], [MO1d]) |
| Bug fix (existing behavior wrong)                          | Edit the smallest correct owner; add tests to lock behavior         | Create a parallel/shadow implementation                 |
| Logic change in stable code                                | Extract/replace via composition; keep stable code stable ([MO1g])   | Add flags, shims, or “compat” paths to hide uncertainty |
| Touching a large/overloaded file                           | Extract at least one seam (new hook/sub-component) ([FS1g], [MO1b]) | Grow the file further ([MO1a])                          |
| Reuse needed across features                               | Add a domain-specific hook or service with intent-revealing name    | Add `*Utils/*Helper/*Common` grab bags                  |

### When adding a prop/method is allowed

Adding to an existing component/hook is allowed only when all are true:

- It is the **same responsibility** as the existing purpose ([MO1d]).
- The inputs belong together (avoid prop drilling/data clumps).
- The change does not violate Server/Client boundaries.

If any bullet fails, create a new component/hook.

## Create-new-file checklist (before you write code)

1. **Search/reuse first**: confirm a pattern doesn’t already exist ([FS1a]).
2. **Pick the correct layer** (app → feature → ui → lib).
3. **Pick the correct directory** (feature-first, colocation).
4. **Name by role** (ban generic names; suffix declares meaning like `*Card`, `*List`, `*Form`) ([ND1a]).
5. **Keep the file small** (stay comfortably under 350 LOC; split by concept early) ([LOC1a]).
6. **Verify** with repo-standard commands (`bun run lint`, `bun run type-check`).

## Repository structure and naming (placement is part of the contract)

### Feature-first organization

Organize by **feature first**, then by technical role.

Examples:

- `src/app/dashboard/...`
- `src/components/dashboard/DashboardCard.tsx`
- `src/lib/dashboard/dashboard-service.ts`

### No mixed responsibilities

A file contains either:

- A single component export, or
- A set of closely related, cohesive utility functions.

### Naming conventions

- Components: `PascalCase` (`UserCard.tsx`)
- Hooks: `camelCase` starting with use (`useUser.ts`)
- Utilities/Services: `kebab-case` (`user-service.ts`)
- Types/Schemas: `kebab-case` (`user-schema.ts`)

## Verification gates (do not skip)

- LOC enforcement: `bun run check:file-size` reports violations ([LOC1c]).
- Validation: `bun run validate` ([VR1a]).
