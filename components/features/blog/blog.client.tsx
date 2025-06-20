/**
 * Blog Page Component
 * @module components/features/blog/blog.client
 * @description
 * Client component for the blog page
 * Uses a hybrid architecture with server components for content
 * and client components for interactivity
 */

"use client";

/**
 * Blog Page Component
 * Uses a hybrid architecture with server components for content
 * and client components for interactivity
 */

import { BlogWindow } from "./blog-window.client";

import type { BlogPropsWithChildren } from "@/types/features";

/**
 * Main Blog component using a hybrid architecture for optimal performance
 * This client component renders pre-rendered server content passed as children
 */
export function Blog({ children }: BlogPropsWithChildren) {
  return <BlogWindow>{children}</BlogWindow>;
}
