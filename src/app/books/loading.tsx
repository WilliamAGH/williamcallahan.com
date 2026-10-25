/**
 * The books index and each book page read uncached data, so their content
 * streams inside this segment boundary while the shared layout stays in the
 * prerendered shell.
 */
export default function Loading() {
  return <div className="min-h-screen" aria-hidden="true" />;
}
