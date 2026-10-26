/** @vitest-environment node */

import { extractBookIdFromSlug, findBookBySlug, generateBookSlug } from "@/lib/books/slug-helpers";
import type { BookSlugInput } from "@/types/features/books";

const book: BookSlugInput = {
  id: "d90bcc063976",
  title: "The Example Book",
  authors: ["Example Author"],
  isbn13: "9780135957059",
};

describe("book slugs", () => {
  it("generates one title-author-ID slug for a resolved book", () => {
    expect(generateBookSlug(book.title, book.id, book.authors, book.isbn13)).toBe(
      "the-example-book-example-author-d90bcc063976",
    );
  });

  it.each([
    "the-example-book-example-author-d90bcc063976",
    "source-audit-d90bcc063976",
    "d90bcc063976",
    "9780135957059",
  ])("resolves supported incoming alias %s to the same book", (slug) => {
    expect(findBookBySlug(slug, [book])).toEqual(book);
  });

  it("keeps legacy AudioBookShelf IDs intact", () => {
    const legacyBook = { ...book, id: "li_8gch9ve09orgn4fdz8" };
    expect(extractBookIdFromSlug(legacyBook.id)).toBe(legacyBook.id);
    expect(findBookBySlug(`old-title-${legacyBook.id}`, [legacyBook])).toEqual(legacyBook);
  });

  it("does not resolve an unknown ID", () => {
    expect(findBookBySlug("source-audit-nonexistent", [book])).toBeNull();
  });
});
