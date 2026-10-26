/**
 * Book details read uncached data. Keep their boundary here so the books
 * index's static heading and introduction are not hidden by a segment fallback.
 */
export default function Loading() {
  return <div className="min-h-screen" aria-hidden="true" />;
}
