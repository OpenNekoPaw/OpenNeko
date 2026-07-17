/**
 * ErrorBoundary Component
 * React 错误边界 - 捕获子组件渲染错误，防止整个应用崩溃
 */

import { WebviewErrorBoundary } from '@neko/ui/error-boundary';
import type { ErrorInfo, ReactNode } from 'react';
import { getLogger } from '../../utils/logger';

const logger = getLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** 自定义错误回退 UI */
  readonly fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** 错误回调 */
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export function ErrorBoundary({ children, fallback, onError }: ErrorBoundaryProps): ReactNode {
  return (
    <WebviewErrorBoundary
      logger={logger}
      fallback={
        typeof fallback === 'function' ? ({ error, reset }) => fallback(error, reset) : fallback
      }
      onError={onError}
      title="Something went wrong"
      description={(error) => error.message || 'An unexpected error occurred'}
      retryLabel="Try again"
      className="flex h-full flex-col items-center justify-center bg-[var(--vscode-editor-background)] p-4 text-center text-[var(--vscode-editor-foreground)]"
      contentClassName="flex max-w-md flex-col items-center gap-3"
      buttonClassName="rounded bg-[var(--vscode-button-background)] px-4 py-2 text-sm text-[var(--vscode-button-foreground)] transition-colors hover:bg-[var(--vscode-button-hoverBackground)]"
    >
      {children}
    </WebviewErrorBoundary>
  );
}
