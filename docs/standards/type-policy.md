---
title: "Type Policy"
description: "Zod schema patterns and type derivation"
---

# Type Policy

See `AGENTS.md` ([TS1]).

Do not treat `src/types/schemas/api.ts` as the owner of every external-service schema. It owns cross-domain API error, client telemetry, health, and diagnostic contracts; `src/types/github.ts` owns GitHub external API schemas. Consumers import the schema and `z.infer` type from the relevant canonical owner instead of restating response fields.

## Zod Schema Pattern

```ts
// types/schemas/example.ts
import { z } from "zod/v4";

export const exampleSchema = z.object({
  id: z.string(),
});

export type Example = z.infer<typeof exampleSchema>;
```
