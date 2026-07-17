import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({
  action,
  className,
  description,
  icon,
  title,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex min-h-24 flex-col items-center justify-center gap-2 p-4 text-center text-[var(--vscode-descriptionForeground)]',
        className,
      )}
    >
      {icon ? <div className="text-[var(--vscode-foreground)]">{icon}</div> : null}
      <div className="text-sm font-medium text-[var(--vscode-foreground)]">{title}</div>
      {description ? <div className="max-w-64 text-xs leading-5">{description}</div> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
