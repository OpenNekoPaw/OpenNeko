import type React from 'react';
import type { ReactNode } from 'react';
import { cn } from '../utils';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly action?: ReactNode;
  readonly fill?: boolean;
  readonly className?: string;
}

export function EmptyState({
  action,
  className,
  description,
  fill = false,
  icon,
  title,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      data-neko-empty-state={fill ? 'fill' : 'compact'}
      className={cn(
        'flex flex-col items-center justify-center gap-2 p-4 text-center text-[var(--neko-descriptionForeground)]',
        fill ? 'col-span-full min-h-48 w-full flex-1 self-stretch' : 'min-h-24',
        className,
      )}
    >
      {icon ? (
        <div
          className={
            fill ? 'text-[var(--neko-descriptionForeground)]' : 'text-[var(--neko-foreground)]'
          }
        >
          {icon}
        </div>
      ) : null}
      <div
        className={
          fill
            ? 'text-xs font-normal text-[var(--neko-descriptionForeground)]'
            : 'text-sm font-medium text-[var(--neko-foreground)]'
        }
      >
        {title}
      </div>
      {description ? <div className="max-w-64 text-xs leading-5">{description}</div> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
