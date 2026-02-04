/**
 * Minimal rehype-raw mock for test environment
 */
export default function rehypeRaw(): (tree: unknown) => void {
  return (_tree) => {};
}
