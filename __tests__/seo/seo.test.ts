import { Activity, createElement, Fragment, StrictMode } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { render } from "@testing-library/react";

import { JsonLdScript } from "@/components/seo/json-ld";

describe("JsonLdScript", () => {
  it("renders parseable structured data as a native script element", () => {
    const data = {
      "@context": "https://schema.org",
      name: "Markup safety </script><!--",
    };

    const html = renderToStaticMarkup(createElement(JsonLdScript, { data, id: "page-schema" }));
    const scriptContent = html.match(
      /^<script type="application\/ld\+json" id="page-schema">(.*)<\/script>$/s,
    );

    expect(scriptContent).not.toBeNull();
    if (!scriptContent) {
      throw new Error("JSON-LD script did not render");
    }

    expect(html).not.toContain("self.__next_s");
    expect(scriptContent[1]).toContain("\\u003c/script>");
    expect(JSON.parse(scriptContent[1])).toEqual(data);
  });

  it.each([false, true])(
    "exposes only graphs from visible Activity routes (strict mode: %s)",
    (strictMode) => {
      const articleGraph = { "@type": "Article", name: "Article" };
      const softwareGraph = { "@type": "SoftwareApplication", name: "Software" };
      const collectionGraph = { "@type": "CollectionPage", name: "Tag" };

      function RouteActivities({
        activeRoute,
        hasVisitedTag,
      }: Readonly<{ activeRoute: "article" | "tag"; hasVisitedTag: boolean }>) {
        const articleActivity = createElement(
          Activity,
          { key: "article", mode: activeRoute === "article" ? "visible" : "hidden" },
          createElement(JsonLdScript, { data: articleGraph }),
          createElement(JsonLdScript, { data: softwareGraph }),
        );
        const tagActivity = createElement(
          Activity,
          { key: "tag", mode: activeRoute === "tag" ? "visible" : "hidden" },
          createElement(JsonLdScript, { data: collectionGraph }),
        );
        const routeActivities =
          activeRoute === "tag"
            ? [tagActivity, articleActivity]
            : hasVisitedTag
              ? [articleActivity, tagActivity]
              : [articleActivity];
        const content = createElement(Fragment, null, ...routeActivities);

        return strictMode ? createElement(StrictMode, null, content) : content;
      }

      const rendered = render(
        createElement(RouteActivities, { activeRoute: "article", hasVisitedTag: false }),
      );
      const readGraphs = () =>
        Array.from(
          document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
          (script) => JSON.parse(script.textContent ?? ""),
        );

      expect(readGraphs()).toEqual([articleGraph, softwareGraph]);

      rendered.rerender(
        createElement(RouteActivities, { activeRoute: "tag", hasVisitedTag: true }),
      );
      expect(readGraphs()).toEqual([collectionGraph]);

      rendered.rerender(
        createElement(RouteActivities, { activeRoute: "article", hasVisitedTag: true }),
      );
      expect(readGraphs()).toEqual([articleGraph, softwareGraph]);
    },
  );

  it("hydrates server-prerendered JSON-LD without dropping the active graph", () => {
    const data = { "@type": "WebPage", name: "Hydrated page" };
    const element = createElement(JsonLdScript, { data });
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);

    render(element, {
      container,
      hydrate: true,
      onRecoverableError(error) {
        throw error;
      },
    });

    const script = container.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(JSON.parse(script?.textContent ?? "")).toEqual(data);
  });

  it("keeps a client-mounted hidden Activity semantically inert", () => {
    const data = { "@type": "Article", name: "Deferred hidden graph" };

    render(createElement(Activity, { mode: "hidden" }, createElement(JsonLdScript, { data })));

    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});
