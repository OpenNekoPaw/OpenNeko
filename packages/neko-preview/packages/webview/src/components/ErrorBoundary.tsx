import { WebviewErrorBoundary } from '@neko/ui/error-boundary';
import type { ReactNode } from 'react';
import { getLogger } from '../utils/logger';

const logger = getLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

export function ErrorBoundary({ children }: ErrorBoundaryProps): ReactNode {
  return (
    <WebviewErrorBoundary
      logger={logger}
      title="Something went wrong"
      retryLabel="Try again"
      className="flex h-full flex-col items-center justify-center p-4 text-center text-[var(--vscode-editor-foreground)] bg-[var(--vscode-editor-background)]"
    >
      {children}
    </WebviewErrorBoundary>
  );
}
