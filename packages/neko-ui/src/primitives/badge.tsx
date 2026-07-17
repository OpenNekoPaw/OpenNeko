import type React from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}

const toneClassNames = {
  neutral: 'bg-[var(--neko-surface)] text-[var(--vscode-foreground)] border-[var(--neko-border)]',
  accent: 'bg-[var(--neko-accent)] text-[var(--vscode-button-foreground)] border-transparent',
  success:
    'bg-[var(--vscode-testing-iconPassed,var(--neko-accent))] text-[var(--vscode-button-foreground)] border-transparent',
  warning:
    'bg-[var(--vscode-inputValidation-warningBackground,var(--neko-surface))] text-[var(--vscode-inputValidation-warningForeground,var(--vscode-foreground))] border-[var(--vscode-inputValidation-warningBorder,var(--neko-border))]',
  danger: 'bg-[var(--neko-danger)] text-[var(--vscode-button-foreground)] border-transparent',
} satisfies Record<NonNullable<BadgeProps['tone']>, string>;

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-[var(--neko-radius-sm,6px)] border px-1.5 text-[11px] font-medium',
        toneClassNames[tone],
        className,
      )}
      {...props}
    />
  );
}
