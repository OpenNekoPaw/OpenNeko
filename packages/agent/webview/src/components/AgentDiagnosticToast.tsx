import type { ReactNode, ReactPortal } from 'react';
import { createPortal } from 'react-dom';

export interface AgentDiagnosticToastProps {
  readonly title: ReactNode;
  readonly children: ReactNode;
}

export function AgentDiagnosticToast({ children, title }: AgentDiagnosticToastProps): ReactPortal {
  return createPortal(
    <div
      className="fixed right-4 top-12 z-[60] w-[360px] max-w-[calc(100vw-2rem)] break-words rounded-lg border border-[var(--neko-inputValidation-errorBorder,var(--agent-border))] bg-[var(--neko-inputValidation-errorBackground,var(--agent-elevated))] px-3 py-2 text-sm text-[var(--neko-inputValidation-errorForeground,var(--agent-fg))] shadow-lg animate-slide-in"
      data-agent-diagnostic-toast="true"
      role="alert"
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 opacity-90">{children}</div>
    </div>,
    document.body,
  );
}
