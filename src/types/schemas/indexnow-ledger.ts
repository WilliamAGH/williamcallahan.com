import { z } from "zod/v4";

/** Public URL -> normalized last-modified timestamp accepted by IndexNow. */
export const indexNowLedgerSchema = z.record(z.url(), z.iso.datetime());
export type IndexNowLedger = z.infer<typeof indexNowLedgerSchema>;
