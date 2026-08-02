import type React from 'react';
import type { MarkdownUiDiagnostic } from './types';
import { cn } from '../utils';

export interface MarkdownDiagnosticsProps {
  readonly diagnostics: readonly MarkdownUiDiagnostic[];
  readonly className?: string;
}

export function MarkdownDiagnostics({
  diagnostics,
  className,
}: MarkdownDiagnosticsProps): React.ReactElement | null {
  if (diagnostics.length === 0) return null;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)} data-markdown-diagnostics="true">
      {diagnostics.map((diagnostic, index) => (
        <div
          key={`${diagnostic.code}-${diagnostic.range?.startOffset ?? 'global'}-${index}`}
          className={getDiagnosticClassName(diagnostic.severity)}
          data-markdown-diagnostic={diagnostic.code}
          data-markdown-diagnostic-source={diagnostic.source}
        >
          {diagnostic.message}
        </div>
      ))}
    </div>
  );
}

function getDiagnosticClassName(severity: MarkdownUiDiagnostic['severity']): string {
  const base = 'rounded border px-2 py-1 text-[11px] leading-4';
  switch (severity) {
    case 'fatal':
    case 'error':
      return cn(base, 'border-red-200 bg-red-50 text-red-800');
    case 'warning':
      return cn(base, 'border-amber-200 bg-amber-50 text-amber-800');
    case 'info':
      return cn(base, 'border-sky-200 bg-sky-50 text-sky-800');
  }
}
