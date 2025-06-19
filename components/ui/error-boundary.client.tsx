/**
 * Error Boundary Component
 *
 * This component is used to catch errors in the component tree and display a fallback UI.
 * It also reports errors to Sentry for monitoring.
 */

"use client";

import * as Sentry from "@sentry/nextjs";
import { Component, type ReactNode } from "react";
import type { ErrorInfo } from "react";
import type { LocalErrorBoundaryProps, ErrorBoundaryState } from "@/types/ui";

/**
 * Generic Error Boundary component to prevent component errors from crashing the entire app
 * Catches all errors in its child component tree and displays a fallback UI
 */
export class ErrorBoundary extends Component<LocalErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: LocalErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Report error to monitoring services
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });

    // Only log in development to avoid console pollution in production
    if (process.env.NODE_ENV !== "production") {
      console.error("Component error caught by ErrorBoundary:", error);
      console.error("Component stack:", errorInfo.componentStack);
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // 1. If a fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 2. If silent mode is enabled, render a minimal reset button or nothing
      if (this.props.silent) {
        // Check if we're on a mobile device (approximate detection)
        const isMobileDevice =
          typeof window !== "undefined" &&
          ((typeof window.innerWidth !== "undefined" && window.innerWidth <= 768) ||
            (typeof navigator !== "undefined" &&
              /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)));

        // For mobile devices, render an even more subtle fallback
        if (isMobileDevice) {
          return (
            <div className="py-1">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="text-xs text-gray-400 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-500"
                aria-label="Reload component"
              >
                ↻
              </button>
            </div>
          );
        }

        // For desktop in silent mode, show minimal UI
        return (
          <div className="py-2">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded text-gray-500 dark:text-gray-400"
            >
              Reload
            </button>
          </div>
        );
      }

      // 3. Default fallback UI for normal mode
      return (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 my-4">
          <h2 className="text-red-800 dark:text-red-400 font-medium mb-2">Something went wrong</h2>
          <p className="text-red-700 dark:text-red-300 text-sm">
            We&apos;ve been notified and will fix this as soon as possible.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="mt-2 px-3 py-1 text-xs bg-red-100 dark:bg-red-800/50 text-red-800 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
