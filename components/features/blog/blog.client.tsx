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

import { ReactNode } from 'react';
import { BlogWindow } from './blog-window.client';

// Define props for the Blog component
interface BlogProps {
  children: ReactNode;
}

/**
 * Main Blog component using a hybrid architecture for optimal performance
 * This client component renders pre-rendered server content passed as children
 */
export function Blog({ children }: BlogProps) {
  return (
    <BlogWindow>
      {children}
    </BlogWindow>
  );
}