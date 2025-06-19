/**
 * UI Boundary Component Types
 *
 * SCOPE: Types for components that create boundaries, like Error Boundaries.
 */
import type { ReactNode, ErrorInfo } from "react";

export interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Optional fallback component */
  fallback?: ReactNode;
  /** Optional error callback */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export interface ErrorBoundaryState {
  /** Whether an error has occurred */
  hasError: boolean;
  /** The error that occurred */
  error?: Error;
  /** Error information */
  errorInfo?: ErrorInfo;
}

export interface LocalErrorBoundaryProps extends ErrorBoundaryProps {
  silent?: boolean;
}
