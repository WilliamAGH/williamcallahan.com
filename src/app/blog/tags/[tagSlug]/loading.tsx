/**
 * The tag page can still be reading posts when the prerender closes, so its
 * content streams inside this segment boundary while the shared layout stays in
 * the prerendered shell.
 */
export default function Loading() {
  return <div className="min-h-screen" aria-hidden="true" />;
}
