/**
 * @file mdx-content.client.tsx - Client-side component for rendering MDX (Markdown Extended) content.
 * This component leverages `next-mdx-remote` to render serialized MDX strings,
 * applying a comprehensive set of custom components and styles for various HTML elements
 * and custom directives. It enhances the standard Markdown rendering with features like
 * optimized images, syntax-highlighted code blocks, specialized UI elements (e.g., BackgroundInfo,
 * CollapseDropdown, FinancialMetrics), and consistent typography and layout through Tailwind CSS `prose` classes.
 * It also includes dynamic adjustments such as SVG transform processing post-render.
 */
"use client";

import { MDXProvider } from "@mdx-js/react";
import * as mdxRuntime from "@mdx-js/react";
import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import React, {
  type ComponentProps,
  type ComponentType,
  type ReactElement,
  isValidElement,
  useEffect,
  useRef,
  useMemo,
  useContext,
  type JSX,
} from "react";
import * as jsxProdRuntime from "react/jsx-runtime";
import * as jsxDevRuntime from "react/jsx-dev-runtime";
import Image from "next/image";
import { Base64Image } from "@/components/utils/base64-image.client";
import { CollapseDropdownProvider } from "@/lib/context/collapse-dropdown-context.client";
import { cn } from "@/lib/utils";
import { processSvgTransforms } from "@/lib/image-handling/svg-transform-fix";
import {
  getOptimizedImageSrc,
  shouldBypassOptimizer,
  buildCdnUrl,
  getCdnConfigFromEnv,
} from "@/lib/utils/cdn-utils";
import coverImageManifest from "@/data/blog/cover-image-map.json";
import {
  BlogImageResolutionError,
  type ArticleImageProps,
  type ArticleGalleryProps,
  type MDXContentProps,
} from "@/types/features";
import type { MetricsGroupProps } from "@/types/ui";
import { BackgroundInfo } from "../../../ui/background-info.client";
import { MDXCodeBlock } from "../../../ui/code-block/mdx-code-block-wrapper.client";
import { CollapseDropdown } from "../../../ui/collapse-dropdown.client";
import { ExternalLink } from "../../../ui/external-link.client";
import {
  InstructionMACOSTab,
  InstructionMacOSFrameTabs,
  MacOSFrameContext,
} from "../../../ui/instruction-macos-frame-tabs.client";
import { MacOSCodeWindow, MacOSWindow } from "../../../ui/macos-window.client";
import { ShellParentTabs, ShellTab } from "../../../ui/shell-parent-tabs.client";
import { TweetEmbed } from "../tweet-embed";
import { SoftwareSchema } from "./software-schema";

const compiledMdxCache = new Map<string, ComponentType>();

const withKeyedChildren = (children: React.ReactNode, prefix: string): React.ReactNode => {
  let index = 0;
  return React.Children.map(children, (child) => {
    if (!isValidElement(child)) {
      return child;
    }
    if (child.key != null) {
      return child;
    }
    const key = `${prefix}-${index++}`;
    return React.cloneElement(child, { key });
  });
};

const toKeyed = (children: React.ReactNode) => React.Children.toArray(children);

const devJsx = (...args: Parameters<typeof jsxDevRuntime.jsxDEV>) => {
  const [type, props, key, , source, self] = args;
  return jsxDevRuntime.jsxDEV(type, props, key, false, source, self);
};

const devJsxs = (...args: Parameters<typeof jsxDevRuntime.jsxDEV>) => {
  const [type, props, key, , source, self] = args;
  return jsxDevRuntime.jsxDEV(type, props, key, true, source, self);
};

const runtimeHelpers =
  process.env.NODE_ENV === "development"
    ? {
        Fragment: jsxDevRuntime.Fragment,
        jsx: devJsx,
        jsxs: devJsxs,
        jsxDEV: jsxDevRuntime.jsxDEV,
        _jsxDEV: jsxDevRuntime.jsxDEV,
      }
    : {
        Fragment: jsxProdRuntime.Fragment,
        jsx: jsxProdRuntime.jsx,
        jsxs: jsxProdRuntime.jsxs,
      };

const buildMdxComponent = (
  content: import("next-mdx-remote").MDXRemoteSerializeResult<
    Record<string, unknown>,
    Record<string, unknown>
  >,
): ComponentType => {
  const cached = compiledMdxCache.get(content.compiledSource);
  if (cached) {
    return cached;
  }

  try {
    const scope = content.scope ?? {};
    const frontmatter = content.frontmatter ?? {};

    const fullScope: Record<string, unknown> = Object.assign(
      {
        opts: {
          ...mdxRuntime,
          ...runtimeHelpers,
        },
      },
      { frontmatter },
      scope,
    );

    const keys = Object.keys(fullScope);
    const values = Object.values(fullScope);
    const hydrateFn = Reflect.construct(Function, keys.concat(`${content.compiledSource}`)) as (
      ...fnArgs: unknown[]
    ) => { default: ComponentType };
    const { default: Component } = hydrateFn.apply(hydrateFn, values) as { default: ComponentType };
    const SafeComponent: ComponentType = (componentProps) => <Component {...componentProps} />;
    compiledMdxCache.set(content.compiledSource, SafeComponent);
    return SafeComponent;
  } catch (error) {
    console.error("[MDXContent] Failed to evaluate compiled MDX source", error);
    const Fallback: ComponentType = () => (
      <p className="text-red-600 dark:text-red-400">
        Unable to render this portion of the article. Please refresh or contact support if the issue
        persists.
      </p>
    );
    return Fallback;
  }
};

/**
 * Hook to check if we're currently inside a macOS frame
 */
const useIsInMacOSFrame = () => useContext(MacOSFrameContext);

/**
 * PreRenderer - MDX code block detection and routing component
 *
 * This component examines <pre> elements from MDX and determines if they
 * are proper code blocks (with language-* classes) or plain text.
 *
 * Known issue: Code blocks inside JSX components (like InstructionTab) may
 * lose their language-* classes during MDX parsing, causing them to render
 * as plain gray boxes instead of syntax-highlighted code blocks.
 *
 * @param props - Pre element props from MDX
 * @returns Either MDXCodeBlock (for proper code) or fallback pre styling
 */
const PreRenderer = (props: ComponentProps<"pre">) => {
  const isInMacOSFrame = useIsInMacOSFrame();

  let isProperCodeBlock = false;

  // Check for data attributes that might indicate code blocks (e.g., from Rehype Pretty Code)
  // Check for existence of the attribute, its value doesn't matter as much as its presence.
  const hasCodeBlockAttrs =
    props["data-language"] !== undefined || props["data-rehype-pretty-code-fragment"] !== undefined;

  // Check 1: Class on the <pre> tag itself (e.g., from Rehype Pretty Code) or data attributes
  if (
    hasCodeBlockAttrs ||
    (props.className &&
      typeof props.className === "string" &&
      props.className.includes("language-"))
  ) {
    isProperCodeBlock = true;
  }

  // Check 2: Class on any direct <code> child, if Check 1 failed (common MDX structure)
  if (
    !isProperCodeBlock &&
    React.Children.toArray(props.children).some(
      (child) =>
        isValidElement<{ className?: string }>(child) &&
        child.type === "code" &&
        typeof child.props.className === "string" &&
        child.props.className.includes("language-"),
    )
  ) {
    isProperCodeBlock = true;
  }

  if (!isProperCodeBlock) {
    // Fallback for non-standard <pre> tags or those without recognized code.
    // Renders with reduced text size for consistency.
    return (
      <div className="not-prose group relative">
        <pre className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 p-3 rounded font-mono text-xs break-words whitespace-pre-wrap mb-4">
          {props.children}
        </pre>
      </div>
    );
  }

  // Extract className from the first code child element for proper syntax highlighting
  // Defensively find the first <code> element to handle cases where MDX emits multiple children
  const firstCodeChild = React.Children.toArray(props.children).find(
    (child) => isValidElement<{ className?: string }>(child) && child.type === "code",
  ) as ReactElement<{ className?: string }> | undefined;

  const childClassName =
    typeof firstCodeChild?.props?.className === "string"
      ? firstCodeChild.props.className
      : undefined;

  // Use context to determine if we're in a macOS frame
  return (
    <MDXCodeBlock {...props} embeddedInTabFrame={isInMacOSFrame} className={cn(childClassName)} />
  );
};

const coverImageMap: Record<string, string> = coverImageManifest;

/**
 * Resolves a blog image path to its optimized source URL.
 * Throws BlogImageResolutionError if optimization fails ([RC1a] - no silent fallbacks).
 *
 * Resolution paths:
 * - Data URLs → passed through unchanged (already embedded)
 * - Local `/images/posts/...` → CDN URLs via cover-image-map.json
 * - CDN URLs → passed through for Next.js optimization
 * - External URLs → proxied for SSRF protection
 *
 * @throws {BlogImageResolutionError} When image cannot be resolved to optimized URL
 */
function resolveBlogImageSrc(src: string): string {
  // Data URLs pass through unchanged - already embedded
  if (src.startsWith("data:")) {
    return src;
  }

  // Local blog post images: convert to CDN URLs using the cover image map
  if (src.startsWith("/images/posts/")) {
    const filename = src.split("/").pop();
    if (filename) {
      const baseName = filename.replace(/\.[^.]+$/, "");
      const s3Key = coverImageMap[baseName];
      if (s3Key) {
        const cdnConfig = getCdnConfigFromEnv();
        return buildCdnUrl(s3Key, cdnConfig);
      }
    }
    throw new BlogImageResolutionError(
      src,
      `Missing CDN mapping. Run: bun scripts/sync-blog-cover-images.ts`,
    );
  }

  // For all other URLs, use getOptimizedImageSrc which handles:
  // - CDN URLs → direct pass-through
  // - External URLs → proxy for SSRF protection
  // - Other local paths → pass-through
  const optimizedSrc = getOptimizedImageSrc(src);
  if (optimizedSrc === undefined) {
    throw new BlogImageResolutionError(src, `Unsupported URL format for optimization`);
  }
  return optimizedSrc;
}

/**
 * @component MdxImage
 * Renders an image within MDX content with caption support and width controls.
 * - Data URLs render via Base64Image for proper sizing.
 * - Local paths (`/images/posts/...`) are resolved to CDN URLs for optimization.
 * - External URLs are proxied for SSRF protection.
 * - Defaults to ~75% width on large screens; override with size, widthPct, or vwPct.
 *
 * @param {ArticleImageProps} props - The properties for the MdxImage component.
 * @param {string} [props.src=''] - The source URL or Base64 data string of the image.
 * @param {string} [props.alt=''] - The alternative text for the image.
 * @param {string} [props.caption] - Optional caption to display below the image.
 * @param {'full' | 'medium' | 'small'} [props.size='medium'] - Preset display size (ignored if widthPct/vwPct provided).
 * @param {number} [props.widthPct] - Optional container-relative width percentage (0–100).
 * @param {number} [props.vwPct] - Optional viewport-relative width percentage (0–100).
 * @param {boolean} [props.priority=false] - Whether the image is a priority for loading.
 * @returns {JSX.Element | null} The rendered image wrapped in a <figure> with an optional <figcaption>,
 *                               or null if `src` is missing/invalid.
 */
const MdxImage = ({
  src = "",
  alt = "",
  caption,
  size = "medium",
  priority = false,
  widthPct,
  vwPct,
}: ArticleImageProps): JSX.Element | null => {
  if (typeof src !== "string" || !src) return null;

  // Responsive width defaults: center and keep images narrower than the content width
  // Default (medium): 75% on large screens, wider on small screens for readability
  let widthClass = "w-full md:w-5/6 lg:w-3/4";

  if (size === "full") {
    widthClass = "w-full";
  } else if (size === "small") {
    widthClass = "w-full sm:w-5/6 md:w-2/3 lg:w-1/2";
  }

  // Resolve the image source to an optimized URL (throws on failure per [RC1a])
  const resolvedSrc = resolveBlogImageSrc(src);
  const isDataUrl = src.startsWith("data:");

  // Choose the appropriate image component based on URL type
  let content: JSX.Element;

  if (isDataUrl) {
    // Data URLs: use Base64Image component (handles hydration properly)
    content = (
      <Base64Image
        src={src}
        alt={alt}
        width={1600}
        height={800}
        className="rounded-lg shadow-md w-full h-auto"
        priority={priority}
      />
    );
  } else {
    // All other URLs: use Next.js Image with proper optimization
    // - CDN URLs: Next.js optimizer handles WebP conversion, srcset
    // - Proxy URLs: bypass optimizer (already processed by API route)
    const useUnoptimized = shouldBypassOptimizer(resolvedSrc);
    content = (
      <Image
        src={resolvedSrc}
        alt={alt}
        width={1600}
        height={800}
        className="rounded-lg shadow-md w-full h-auto"
        priority={priority}
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 83vw, 75vw"
        {...(useUnoptimized ? { unoptimized: true } : {})}
      />
    );
  }

  const clampToStep = (value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    return Math.round(clamped / 5) * 5;
  };

  let widthModifierClass: string | undefined;
  if (typeof vwPct === "number" && !Number.isNaN(vwPct)) {
    widthModifierClass = `mdx-figure-vw-${clampToStep(vwPct)}`;
  } else if (typeof widthPct === "number" && !Number.isNaN(widthPct)) {
    widthModifierClass = `mdx-figure-w-${clampToStep(widthPct)}`;
  }

  return (
    <figure className={cn(widthClass, "mx-auto my-6", widthModifierClass)}>
      {content}
      {caption && (
        <figcaption className="mt-3 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
};

/**
 * @component ArticleGallery
 * A container component for creating a visually distinct gallery of images or other media
 * within MDX content. It applies specific styling for layout, background, and spacing.
 *
 * @param {ArticleGalleryProps} props - The properties for the ArticleGallery component.
 * @param {ReactNode} props.children - The elements to be rendered inside the gallery.
 * @param {string} [props.className=''] - Optional additional CSS classes for the gallery container.
 * @returns {JSX.Element} The rendered gallery container as a `<div>` element.
 */
const ArticleGallery = ({ children, className = "" }: ArticleGalleryProps): JSX.Element => {
  return (
    <div
      className={`flow-root space-y-8 my-6 p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg ${className}`}
    >
      {toKeyed(children)}
    </div>
  );
};

/* -------------------------------------------------------------------
 * Component renderers extracted to avoid nested component definitions
 * ------------------------------------------------------------------- */

const MetricsGroupRenderer = ({ title, date, metrics }: MetricsGroupProps) => {
  return (
    <section className="my-4">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {date ? <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{date}</p> : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
          {Array.isArray(metrics) &&
            metrics.map((m, idx) => {
              const color = m.isPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : m.isNegative
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-900 dark:text-gray-100";
              return (
                <div key={`${m.label}-${idx}`} className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                    {m.label}
                  </span>
                  <span className={cn("font-medium", color)}>{String(m.value)}</span>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
};

const BackgroundInfoRenderer = (props: ComponentProps<typeof BackgroundInfo>) => (
  <BackgroundInfo {...props} className={cn(props.className)} />
);

const CollapseDropdownRenderer = (props: ComponentProps<typeof CollapseDropdown>) => (
  <CollapseDropdown {...props} className={cn(props.className)} />
);

const InstructionToggleTabsRenderer = (props: ComponentProps<typeof InstructionMacOSFrameTabs>) => (
  <InstructionMacOSFrameTabs {...props} className={cn(props.className)} />
);

const InstructionTabRenderer = (props: ComponentProps<typeof InstructionMACOSTab>) => (
  <MacOSFrameContext.Provider value={true}>
    <InstructionMACOSTab {...props} />
  </MacOSFrameContext.Provider>
);

const ShellParentTabsRenderer = (props: ComponentProps<typeof ShellParentTabs>) => (
  <ShellParentTabs {...props} className={cn(props.className)} />
);

const ShellTabRenderer = (props: ComponentProps<typeof ShellTab>) => (
  <MacOSFrameContext.Provider value={true}>
    <ShellTab {...props} />
  </MacOSFrameContext.Provider>
);

const MacOSWindowRenderer = (props: ComponentProps<typeof MacOSWindow>) => (
  <MacOSWindow {...props} className={cn(props.className)} />
);

const MacOSCodeWindowRenderer = (props: ComponentProps<typeof MacOSCodeWindow>) => (
  <MacOSCodeWindow {...props} className={cn(props.className)} />
);

const MDXCodeBlockRenderer = (props: ComponentProps<typeof MDXCodeBlock>) => (
  <MDXCodeBlock {...props} className={cn(props.className)} />
);

const TweetEmbedRenderer = (props: ComponentProps<typeof TweetEmbed>) => (
  <div className="not-prose">
    <TweetEmbed {...props} />
  </div>
);

/**
 * @component MDXContent
 * The primary client-side component for rendering serialized MDX (Markdown Extended) content.
 * It utilizes `MDXRemote` from `next-mdx-remote` to parse and render the MDX string.
 * A key feature is its extensive customization of HTML elements and support for custom components
 * through the `components` prop passed to `MDXRemote`.
 * This allows for tailored styling (via Tailwind CSS and `prose` classes) and enhanced functionality
 * for elements like code blocks, images, tables, lists, and blockquotes.
 * It also incorporates a `useEffect` hook to perform post-render adjustments, such as fixing SVG transformations.
 *
 * @param {MDXContentProps} props - The properties for the MDXContent component.
 * @param {MDXRemoteSerializeResult} props.content - The serialized MDX data to render.
 * @returns {JSX.Element} The rendered MDX content, structured within an `<article>` tag with applied prose styling.
 */
export function MDXContent({ content }: MDXContentProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);

  /**
   * @useEffect
   * This effect hook runs once after the component mounts. Its purpose is to find all SVG elements
   * rendered within the MDX content (via `contentRef`) and apply `processSvgTransforms` to each one.
   * This is a workaround for potential issues where SVG transformations might not be correctly
   * applied or interpreted by the browser directly from the MDX source, ensuring SVGs display as intended.
   */
  useEffect(() => {
    if (contentRef.current) {
      const svgs = contentRef.current.querySelectorAll("svg");
      for (const svg of svgs) {
        processSvgTransforms(svg);
      }
    }
  }, []);

  // Development diagnostics: detect invalid HTML structures from MDX output
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const root = contentRef.current;
    if (!root) return;

    // 1) Identify nested paragraphs which will cause hydration errors
    const nestedParagraphs = root.querySelectorAll("p p");
    if (nestedParagraphs.length > 0) {
      // Log a concise report with surrounding context
      const report = Array.from(nestedParagraphs)
        .slice(0, 10)
        .map((node) => {
          const outer = node.closest("p");
          const outerId = outer?.getAttribute("id") || "";
          const outerClass = outer?.getAttribute("class") || "";
          const innerClass = (node as HTMLElement).className || "";
          return {
            outerId,
            outerClass,
            innerClass,
            innerHTML: (node as HTMLElement).innerHTML.slice(0, 120),
          };
        });
      // Group logs (development only)
      console.groupCollapsed(
        `[MDX Diagnostics] Found ${nestedParagraphs.length} nested <p> elements (this can cause hydration errors)`,
      );
      console.table(report);
      console.groupEnd();
    }

    // 2) Footnote anchors inventory (#ref*, #fn*)
    const footnoteAnchors = root.querySelectorAll('a[href^="#ref"], a[href^="#fn"]');
    if (footnoteAnchors.length > 0) {
      const sample = Array.from(footnoteAnchors)
        .slice(0, 10)
        .map((a) => ({
          href: (a as HTMLAnchorElement).getAttribute("href"),
          text: a.textContent?.slice(0, 60),
        }));
      console.debug("[MDX Diagnostics] Footnote anchors detected:", {
        count: footnoteAnchors.length,
        sample,
      });
    }

    // 3) Superscripts inventory
    const supers = root.querySelectorAll("sup");
    if (supers.length > 0) {
      console.debug("[MDX Diagnostics] <sup> elements detected:", supers.length);
    }
  }, []);

  /**
   * @constant components
   * A memoized object mapping MDX element tag names (or custom component names used in MDX)
   * to their corresponding React components for rendering. This is passed to `MDXRemote`.
   * `useMemo` is employed to prevent this potentially large object from being recreated on every render cycle,
   * which is crucial for performance, especially if `MDXContent` re-renders frequently.
   *
   * Each key in this object represents an HTML tag (e.g., `pre`, `a`, `p`) or a custom component
   * (e.g., `MetricsGroup`, `ArticleGallery`). The value is the React component that will be used
   * to render that element when encountered in the MDX source.
   */
  const components: MDXComponents = useMemo(() => {
    return {
      /** Custom renderer for `<pre>` elements using the PreRenderer component that can access context */
      pre: PreRenderer,
      /**
       * Custom renderer for inline `<code>` elements.
       * Applies specific background, padding, and font styling for inline code snippets,
       * differentiating them from block-level code displays.
       * @param {ComponentProps<'code'>} codeProps - Props passed to the `<code>` element.
       * @returns {JSX.Element} The styled inline code snippet.
       */
      code: ({ className, children, ...rest }: ComponentProps<"code">) => {
        const isBlockCode = className?.includes("language-"); // Heuristic for code within <pre>

        return (
          <code
            className={cn(
              "font-medium align-middle font-mono", // Base styles
              isBlockCode
                ? "whitespace-pre" // For <code> inside <pre>: respect all whitespace. Display will be handled by CSS.
                : "bg-gray-100/80 dark:bg-gray-800/70 text-gray-900 dark:text-gray-100 px-1.5 sm:px-2 py-0.5 rounded-md whitespace-normal break-words ring-1 ring-inset ring-black/5 dark:ring-white/10", // Styles for INLINE <code>
              "text-[13px] leading-relaxed",
              className, // Merge className from MDX (e.g., language-bash)
            )}
            {...rest}
          >
            {children}
          </code>
        );
      },
      /** Renderer for the custom `MetricsGroup` component, providing specific layout. */
      MetricsGroup: MetricsGroupRenderer,
      /** Renderer for `<img>` tags, delegating to the {@link MdxImage} component for enhanced features like captions and optimized loading. */
      img: MdxImage,
      /** Renderer for the custom `ArticleGallery` component, used for displaying a collection of images. */
      ArticleGallery: ArticleGallery,
      /** Alias for `img` renderer, ensuring {@link MdxImage} is also used for the custom `ArticleImage` tag if used in MDX. */
      ArticleImage: MdxImage,
      /** Renderer for the custom `BackgroundInfo` component. */
      BackgroundInfo: BackgroundInfoRenderer,
      /** Renderer for the custom `CollapseDropdown` component. */
      CollapseDropdown: CollapseDropdownRenderer,
      /** Direct mapping for the `ExternalLink` component, used for links opening in a new tab. */
      ExternalLink,
      /** Renderer for the custom `InstructionToggleTabs` component (which maps to `InstructionMacOSFrameTabs`). */
      InstructionToggleTabs: InstructionToggleTabsRenderer,
      /** Renderer for the `InstructionMACOSTab` component with MacOSFrameContext provider. */
      InstructionTab: InstructionTabRenderer,
      /** Renderer for the custom `ShellParentTabs` component. */
      ShellParentTabs: ShellParentTabsRenderer,
      /** Renderer for the `ShellTab` component with MacOSFrameContext provider. */
      ShellTab: ShellTabRenderer,
      /** Renderer for the custom `MacOSWindow` component. */
      MacOSWindow: MacOSWindowRenderer,
      /** Renderer for the custom `MacOSCodeWindow` component. */
      MacOSCodeWindow: MacOSCodeWindowRenderer,
      /** Renderer for `MDXCodeBlock` if used directly as a component tag in MDX (as opposed to via a `<pre>` tag). */
      MDXCodeBlock: MDXCodeBlockRenderer,
      /** Renderer for the custom `SoftwareSchema` component, typically for structured data. */
      SoftwareSchema,
      /**
       * Custom renderer for anchor `<a>` tags.
       * This function intelligently handles different types of links:
       * - Footnote links (starting with `#fn`): Rendered as simple text spans to avoid link behavior.
       * - External links (starting with `http://` or `https://`): Rendered using the `ExternalLink` component, which typically adds `target="_blank"` and appropriate `rel` attributes.
       * - Internal links (starting with `/`): Rendered using Next.js `Link` for client-side navigation.
       * - Other hash links: Rendered as standard `<a>` tags for in-page navigation.
       * @param {ComponentProps<'a'>} props - Props passed to the `<a>` element.
       * @returns {JSX.Element} The appropriately rendered link or span element.
       */
      a: (props: ComponentProps<"a">) => {
        const { href, children, className, ...rest } = props;

        const unwrapParagraph = (node: React.ReactNode): React.ReactNode => {
          if (
            isValidElement<{ children?: React.ReactNode }>(node) &&
            node.type === "p" &&
            Object.hasOwn(node, "props")
          ) {
            return (node as React.ReactElement<{ children?: React.ReactNode }>).props.children;
          }
          return node;
        };

        const normalizedChildren = toKeyed(
          React.Children.map(children, (child: React.ReactNode) => unwrapParagraph(child)) ?? [],
        );
        if (!href) {
          return (
            <a {...rest} className={className}>
              {normalizedChildren}
            </a>
          );
        }

        // Treat footnote-style anchors (#fn*, #ref*) specially: keep them clickable
        // but remove default link styling so superscripts render cleanly.
        if (href.startsWith("#fn") || href.startsWith("#ref")) {
          return (
            <a href={href} {...rest} className={cn("no-underline text-inherit", className)}>
              {normalizedChildren}
            </a>
          );
        }

        if (href.startsWith("http://") || href.startsWith("https://")) {
          return (
            <ExternalLink href={href} {...rest} className={className}>
              {normalizedChildren}
            </ExternalLink>
          );
        }
        if (href.startsWith("/")) {
          return (
            <Link href={href} {...rest} className={className}>
              {normalizedChildren}
            </Link>
          );
        }
        return (
          <a href={href} className="text-inherit no-underline hover:underline" {...rest}>
            {normalizedChildren}
          </a>
        );
      },
      // Ensure consistent superscript rendering across prose and custom containers
      sup: ({ className, children, ...rest }: ComponentProps<"sup">) => (
        <sup className={cn("align-super text-[0.75em] leading-none ml-0.5", className)} {...rest}>
          {children}
        </sup>
      ),
      /** Renderer for `<h1>` elements, applying specific Tailwind CSS classes for styling. */
      h1: ({ children, ...props }: ComponentProps<"h1">) => (
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight" {...props}>
          {children}
        </h1>
      ),
      /** Renderer for `<h2>` elements, applying specific Tailwind CSS classes for styling. */
      h2: ({ children, ...props }: ComponentProps<"h2">) => (
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight" {...props}>
          {children}
        </h2>
      ),
      /** Renderer for `<h3>` elements, applying specific Tailwind CSS classes for styling. */
      h3: ({ children, ...props }: ComponentProps<"h3">) => (
        <h3 className="text-xl font-bold text-gray-900 dark:text-white leading-tight" {...props}>
          {children}
        </h3>
      ),
      // Remove custom <p> renderer to avoid ever creating nested <p> inside raw HTML structures.
      // Let Tailwind Typography's prose styles handle paragraph styling globally.
      /** Renderer for `<ul>` (unordered list) elements. Styling primarily handled by `prose`. */
      ul: ({ className, children, ...rest }: ComponentProps<"ul">) => (
        <ul
          {...rest}
          className={cn("pl-6 list-disc text-gray-700 dark:text-gray-300 text-base", className)}
        >
          {withKeyedChildren(children, "li")}
        </ul>
      ),
      /** Renderer for `<ol>` (ordered list) elements. Styling primarily handled by `prose`. */
      ol: ({ className, children, ...rest }: ComponentProps<"ol">) => (
        <ol
          {...rest}
          className={cn("pl-6 list-decimal text-gray-700 dark:text-gray-300 text-base", className)}
        >
          {withKeyedChildren(children, "li")}
        </ol>
      ),
      /** Renderer for `<li>` (list item) elements. Includes a small bottom margin for spacing. Styling primarily handled by `prose`. */
      li: (props: ComponentProps<"li">) => (
        <li className="mb-1 pl-1 text-gray-700 dark:text-gray-300 text-base" {...props} />
      ),
      /** Renderer for `<blockquote>` elements, applying distinct styling for visual emphasis. */
      blockquote: ({ children, ...rest }: ComponentProps<"blockquote">) => (
        <blockquote
          className="pl-4 border-l-4 border-blue-500 dark:border-blue-400 italic text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 py-3 px-4 rounded-r-md shadow-sm text-base"
          {...rest}
        >
          {toKeyed(children)}
        </blockquote>
      ),
      /** Renderer for `<hr>` (horizontal rule) elements. Currently styled to be hidden. */
      hr: (props: ComponentProps<"hr">) => <hr className="hidden" {...props} />,
      /**
       * Custom renderer for `<table>` elements.
       * Wraps the HTML table in a `<div>` to enable horizontal scrolling on smaller viewports (`overflow-x-auto`)
       * and applies consistent border, shadow, and background styling.
       * @param {ComponentProps<'table'>} props - Props passed to the `<table>` element.
       * @returns {JSX.Element} The styled and wrapped table.
       */
      table: (props: ComponentProps<"table">) => {
        const { children, className, ...restProps } = props;
        return (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <table
              {...restProps}
              className={cn(
                "min-w-full divide-y divide-gray-200 dark:divide-gray-700",
                "bg-white dark:bg-gray-900", // Table background
                className,
              )}
            >
              {toKeyed(children)}
            </table>
          </div>
        );
      },
      tbody: (props: ComponentProps<"tbody">) => {
        const { children, ...rest } = props;
        return <tbody {...rest}>{toKeyed(children)}</tbody>;
      },
      tr: (props: ComponentProps<"tr">) => {
        const { children, ...rest } = props;
        return <tr {...rest}>{toKeyed(children)}</tr>;
      },
      /** Renderer for `<thead>` (table head) elements, applying background styling. */
      thead: (props: ComponentProps<"thead">) => {
        const { children, ...rest } = props;
        return (
          <thead className="bg-gray-50 dark:bg-gray-800" {...rest}>
            {toKeyed(children)}
          </thead>
        );
      },
      /** Renderer for `<th>` (table header cell) elements, applying text, padding, and alignment styling. */
      th: (props: ComponentProps<"th">) => (
        <th
          scope="col"
          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 whitespace-nowrap"
          {...props}
        />
      ),
      /** Renderer for `<td>` (table data cell) elements, applying text and padding styling. */
      td: (props: ComponentProps<"td">) => (
        <td
          className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap"
          {...props}
        />
      ),
      /**
       * Renderer for the custom `TweetEmbed` component.
       * Wrapped in a `div` with `not-prose` to prevent Tailwind Typography styles from interfering
       * with the TweetEmbed component's own internal styling.
       */
      TweetEmbed: TweetEmbedRenderer,
    };
  }, []);
  const CompiledMdxComponent = useMemo(() => buildMdxComponent(content), [content]);

  return (
    <CollapseDropdownProvider>
      <article
        ref={contentRef} // Ref for post-render SVG processing
        suppressHydrationWarning={true} // Suppresses minor hydration warnings common with complex MDX
        className={cn(
          // Base prose styles for overall typography and layout
          "prose dark:prose-invert mx-auto",
          // Customizations for prose elements
          "prose-headings:text-gray-900 dark:prose-headings:text-white",
          "prose-h1:font-bold prose-h1:leading-tight",
          "prose-h2:font-bold prose-h2:leading-tight",
          "prose-h3:font-bold prose-h3:leading-tight",
          "prose-a:text-blue-600 dark:prose-a:text-blue-400 hover:prose-a:text-blue-500 dark:hover:prose-a:text-blue-300",
          "prose-p:break-words prose-p:text-base prose-p:leading-7", // Includes custom line height for paragraphs
          "prose-img:rounded-lg prose-img:shadow-md",
          "prose-hr:hidden", // Hides default horizontal rules
          "prose-li:text-base prose-li:leading-7", // Includes custom line height for list items
          "prose-ul:pl-6",
          "prose-ol:pl-6",
          "prose-blockquote:pl-4 prose-blockquote:border-l-4 prose-blockquote:border-blue-500 dark:prose-blockquote:border-blue-400",
          "blog-content", // Marker class for potential global styling or scripting
          "prose-spacing-override", // Custom class to potentially override prose's default vertical spacing for direct children
        )}
      >
        {/* Wrapper div to enforce consistent vertical spacing between direct children of MDX content */}
        <div className="flex flex-col space-y-5">
          <MDXProvider components={components}>
            <CompiledMdxComponent />
          </MDXProvider>
        </div>
      </article>
    </CollapseDropdownProvider>
  );
}

// Default export for usage, e.g. with next/dynamic or direct import
export default MDXContent;
