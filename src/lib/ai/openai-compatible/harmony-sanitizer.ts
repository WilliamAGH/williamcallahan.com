/**
 * Removes leaked Harmony channel-control sequences from completed model output.
 *
 * `<|channel|>` starts an internal segment, so anything following it is not
 * user-visible text. This is keyed solely to the observed protocol marker.
 */
export function stripHarmonyTokens(text: string): string {
  return text.replace(/<\|channel\|>[\s\S]*/g, "").trim();
}
