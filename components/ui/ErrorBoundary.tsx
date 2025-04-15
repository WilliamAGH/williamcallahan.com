
/**
 * Error Boundary Component
 *
 * This component is used to catch errors in the component tree and display a fallback UI.
 * It also reports errors to Sentry for monitoring.
 */

"use client";

import { Component, ReactNode, ErrorInfo } from 'react';
import * as Sentry from "@sentry/nextjs";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Generic Error Boundary component to prevent component errors from crashing the entire app
 * Catches all errors in its child component tree and displays a fallback UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Report error to monitoring services
    Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });

    console.error('Component error caught by ErrorBoundary:', error);
    console.error('Component stack:', errorInfo.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback
      return (
        <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 my-4">
          <h2 className="text-red-800 dark:text-red-400 font-medium mb-2">Something went wrong</h2>
          <p className="text-red-700 dark:text-red-300 text-sm">
            We&apos;ve been notified and will fix this as soon as possible.
          </p>
          <button
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