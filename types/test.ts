/**
 * @fileoverview Centralized Type Definitions for Testing
 *
 * @description
 * This file contains TypeScript type definitions that are used exclusively for
 * testing purposes. It is the designated location for "test-only" types,
 * such as mock props, mock component types, or types for test helpers.
 *
 * @boundary
 * - **INCLUDE**: Types for mocking components (e.g., `next/image`), utility
 *   functions, or external libraries. These types are generally not part of the
 *   core data model of a specific feature.
 *
 * - **DO NOT INCLUDE**: Types that define the core data structures of the
 *   application's features (e.g., `Investment`, `Bookmark`, `Post`). Even if
 *   used in tests, those types must remain in their respective topical type
 *   files (e.g., `types/investment.ts`) to stay co-located with the feature's
 *   primary data model.
 */

import type { JSX } from "react";
import type { jest } from "@jest/globals";

export type PageComponentModule = {
  default: (props: {
    params: Record<string, string>;
    searchParams: Record<string, string>;
  }) => Promise<JSX.Element> | JSX.Element;
};

export interface BlogFrontmatter {
  slug: string;
  // Add other expected frontmatter properties here if needed
}

export type UmamiMock = {
  track: jest.Mock;
} & jest.Mock;

export type PlausibleMock = jest.Mock;

export type MockScriptProps = {
  id: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  src?: string;
  strategy?: string;
};

export type MockExternalLinkProps = {
  children: React.ReactNode;
  href: string;
  title: string;
  className?: string;
};

export interface MockImageProps {
  src: string;
  alt?: string;
  priority?: boolean;
  layout?: string | undefined;
  objectFit?: string | undefined;
  fill?: boolean;
  [key: string]: unknown;
}

export type MockedWindowEntry = {
  id: string;
  state: "normal" | "minimized" | "maximized" | "closed";
  icon: React.ForwardRefExoticComponent<React.SVGProps<SVGSVGElement> & React.RefAttributes<SVGSVGElement>>;
  title: string;
};

export type MockedSharp = {
  [K in keyof import("sharp").Sharp]: import("sharp").Sharp[K] extends (...args: infer P) => import("sharp").Sharp
    ? jest.Mock<(...args: P) => MockedSharp>
    : import("sharp").Sharp[K] extends (...args: infer P) => Promise<infer R>
      ? jest.Mock<(...args: P) => Promise<R>>
      : import("sharp").Sharp[K];
};

export type SharpInstance = {
  metadata: () => Promise<import("sharp").Metadata>;
  toBuffer: () => Promise<Buffer>;
  png: () => SharpInstance;
  grayscale: () => SharpInstance;
  raw: () => SharpInstance;
  resize: (width: number, height: number, options: import("sharp").ResizeOptions) => SharpInstance;
};
