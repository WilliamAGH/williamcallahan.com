---
title: "Testing Protocols"
description: "Why bun run test* scripts are required"
---

# Testing Protocols

See `AGENTS.md` ([TST1]).

## Why `bun run test*` Scripts Are Required

- **Config Loading**: They load `config/jest/config.ts` (direct `bun test` bypasses it).
- **Setup & Mocking**: They ensure Jest setup files + mocking/globals are applied consistently.
- **Error Prevention**: They prevent common failures (module resolution, jsdom/DOM issues, `jest.mock` problems).
