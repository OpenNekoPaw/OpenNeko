import type { MarkdownDiagnostic } from '@neko/markdown';
import type { TerminalMarkdownMessages } from '../presentation/terminal-label-presentation';
import type { TerminalMarkdownDiagnostic, TerminalStyledSegment } from './contracts';

export interface TerminalDiagnosticPresentation {
  readonly severity: 'info' | 'warning' | 'error' | 'fatal';
  readonly segments: readonly TerminalStyledSegment[];
}

export function presentMarkdownDiagnostic(
  diagnostic: MarkdownDiagnostic | TerminalMarkdownDiagnostic,
  labels: TerminalMarkdownMessages,
): TerminalDiagnosticPresentation {
  const severity = diagnostic.severity;
  const role =
    severity === 'fatal'
      ? 'fatal'
      : severity === 'error'
        ? 'diagnostic-error'
        : severity === 'warning'
          ? 'diagnostic-warning'
          : 'diagnostic-info';
  return {
    severity,
    segments: [
      { text: formatDiagnosticMessage(diagnostic, labels), style: { markdownRole: role } },
    ],
  };
}

export function createFatalMarkdownPresentation(
  detail: string,
  labels: TerminalMarkdownMessages,
): TerminalDiagnosticPresentation {
  return {
    severity: 'fatal',
    segments: [
      {
        text: `${labels.fatalTitle}: `,
        style: { markdownRole: 'fatal', attributes: { bold: true } },
      },
      { text: detail, style: { markdownRole: 'fatal' } },
    ],
  };
}

function formatDiagnosticMessage(
  diagnostic: MarkdownDiagnostic | TerminalMarkdownDiagnostic,
  labels: TerminalMarkdownMessages,
): string {
  if (diagnostic.code === 'TUI_MD_UNSAFE_CONTROL') {
    return labels.unsafeControl(
      String(diagnostic.parameters['control'] ?? diagnostic.parameters['count'] ?? '?'),
    );
  }
  if (diagnostic.code === 'MD_TABLE_GRID_BUDGET_EXCEEDED') {
    return labels.tableGridBudgetExceeded(Number(diagnostic.parameters['cells'] ?? 0));
  }
  if (diagnostic.code === 'MD_HIGHLIGHT_LIMIT_EXCEEDED') {
    return labels.highlightLimitExceeded;
  }
  if (
    diagnostic.code === 'MD_UNSAFE_DESTINATION' ||
    diagnostic.code === 'TUI_MD_UNSAFE_HYPERLINK'
  ) {
    return labels.unsupportedDestination(
      String(diagnostic.parameters['destination'] ?? diagnostic.parameters['target'] ?? '?'),
    );
  }
  return `${diagnostic.code}`;
}
