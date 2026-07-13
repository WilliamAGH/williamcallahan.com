---
title: "Type Policy"
description: "Zod schema patterns and type derivation"
---

# Type Policy

See `AGENTS.md` ([TS1]).

`src/types/schemas/api.ts` is the canonical owner of shared API response and external-service schemas; consumers import its schemas and `z.infer` types instead of restating response fields.

## Zod Schema Pattern

```ts
// types/schemas/example.ts
import { z } from "zod/v4";

export const exampleSchema = z.object({
  id: z.string(),
});

export type Example = z.infer<typeof exampleSchema>;
```
