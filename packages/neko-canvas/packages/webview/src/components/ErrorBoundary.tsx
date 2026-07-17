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
      className="flex h-full flex-col items-center justify-center p-4 text-center text-[var(--neko-fg)] bg-[var(--canvas-bg)]"
      contentClassName="flex max-w-md flex-col items-center gap-3"
      buttonClassName="rounded bg-[var(--button-bg)] px-4 py-2 text-sm text-[var(--button-fg)]"
    >
      {children}
    </WebviewErrorBoundary>
  );
}
