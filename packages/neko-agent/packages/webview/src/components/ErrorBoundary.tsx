import { WebviewErrorBoundary } from '@neko/ui/error-boundary';
import type { ReactNode } from 'react';
import { getLogger } from '@/utils/logger';

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
      className="flex h-full items-center justify-center bg-[var(--agent-bg)] p-4 text-center text-[var(--agent-fg)]"
      contentClassName="agent-card flex max-w-md flex-col items-center gap-3 px-6 py-7"
      buttonClassName="vscode-button"
    >
      {children}
    </WebviewErrorBoundary>
  );
}
