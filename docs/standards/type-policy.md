---
title: "Type Policy"
description: "Zod schema patterns and type derivation"
---

# Type Policy

See `AGENTS.md` ([SC1]).

## Zod Schema Pattern

```ts
// types/schemas/example.ts
import { z } from "zod/v4";

export const exampleSchema = z.object({
  id: z.string(),
});

export type Example = z.infer<typeof exampleSchema>;
```
