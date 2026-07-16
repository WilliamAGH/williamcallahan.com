import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
});
