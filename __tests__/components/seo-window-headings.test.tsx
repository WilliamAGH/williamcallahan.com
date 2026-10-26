import { renderToStaticMarkup } from "react-dom/server";
import { SocialWindow } from "@/components/features/social/social-window.client";
import { BooksClientGrid } from "@/components/features/books/books-grid.client";
import { GlobalWindowRegistryProvider } from "@/lib/context/global-window-registry-context.client";

describe("window page headings in server HTML", () => {
  it("renders the contact page heading, not the window chrome, before registration", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <GlobalWindowRegistryProvider>
        <SocialWindow data={{ socialLinks: [] }} />
      </GlobalWindowRegistryProvider>,
    );

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")).toHaveTextContent("Social Media Profiles");
    expect(container).toHaveTextContent("~/contact");
    expect(container).toHaveTextContent("Here are some of the places I can be found online.");
  });

  it("keeps the Bookshelf heading as the only H1, not the window chrome", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <GlobalWindowRegistryProvider>
        <BooksClientGrid books={[]} title="Bookshelf (Reading List)" description="" />
      </GlobalWindowRegistryProvider>,
    );

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")).toHaveTextContent("Bookshelf (Reading List)");
    expect(container.querySelector('a[href="/books"]')).toHaveTextContent("~/books");
  });
});
