import type { TerminalTimelineRow } from '../types/state';
import type { AgentTerminalPresentationContext } from './context';
import type { CliTerminalMessageKey } from './terminal-messages';

export function presentTimelineProcessLabel(
  row: TerminalTimelineRow,
  presentation: AgentTerminalPresentationContext<CliTerminalMessageKey>,
): string {
  switch (row.kind) {
    case 'tool':
      return row.toolName ?? presentation.t('agent.terminal.timeline.fallback.tool');
    case 'task':
      return row.taskTitle ?? row.taskId ?? presentation.t('agent.terminal.timeline.fallback.task');
    case 'media':
      return (
        row.taskTitle ?? row.taskId ?? presentation.t('agent.terminal.timeline.fallback.media')
      );
    case 'assistant_text':
    case 'thinking':
    case 'error':
    case 'diagnostic':
      throw new Error(`Timeline row kind ${row.kind} does not have a process label.`);
  }
}

export function presentTimelineFailure(
  row: TerminalTimelineRow,
  presentation: AgentTerminalPresentationContext<CliTerminalMessageKey>,
): string {
  const externalDetail = row.content ?? row.details;
  if (externalDetail !== undefined) return externalDetail;

  if (row.kind === 'diagnostic') {
    return presentOwnedTimelineDiagnostic(row.diagnosticCode, presentation);
  }
  if (row.kind === 'error') {
    return presentation.t('agent.terminal.timeline.fallback.error');
  }
  throw new Error(`Timeline row kind ${row.kind} does not have failure presentation.`);
}

function presentOwnedTimelineDiagnostic(
  code: string | undefined,
  presentation: AgentTerminalPresentationContext<CliTerminalMessageKey>,
): string {
  switch (code) {
    case 'missing-tool-call':
      return presentation.t('agent.terminal.timeline.diagnostic.missingToolCall');
    case 'missing-tool-progress-anchor':
      return presentation.t('agent.terminal.timeline.diagnostic.missingToolAnchor', {
        event: 'tool_progress',
      });
    case 'unknown-tool-progress-anchor':
      return presentation.t('agent.terminal.timeline.diagnostic.unknownToolAnchor', {
        event: 'tool_progress',
      });
    case 'missing-tool-confirmation-anchor':
      return presentation.t('agent.terminal.timeline.diagnostic.missingToolAnchor', {
        event: 'tool_confirmation',
      });
    case 'unknown-tool-confirmation-anchor':
      return presentation.t('agent.terminal.timeline.diagnostic.unknownToolAnchor', {
        event: 'tool_confirmation',
      });
    case 'missing-tool-result-anchor':
      return presentation.t('agent.terminal.timeline.diagnostic.missingToolAnchor', {
        event: 'tool_result',
      });
    case 'unknown-tool-result-anchor':
      return presentation.t('agent.terminal.timeline.diagnostic.unknownToolAnchor', {
        event: 'tool_result',
      });
    case 'missing-tool-backfill-anchor':
      return presentation.t('agent.terminal.timeline.diagnostic.missingToolAnchor', {
        event: 'tool_result_backfill',
      });
    case 'unknown-tool-backfill-anchor':
      return presentation.t('agent.terminal.timeline.diagnostic.unknownToolAnchor', {
        event: 'tool_result_backfill',
      });
    case 'timeline-item-kind-mismatch':
      return presentation.t('agent.terminal.timeline.diagnostic.itemKindMismatch');
    case 'timeline-append-non-text-item':
      return presentation.t('agent.terminal.timeline.diagnostic.appendNonTextItem');
    case 'timeline-source-generation-mismatch':
      return presentation.t('agent.terminal.timeline.diagnostic.sourceGenerationMismatch');
    case 'timeline-complete-missing-item':
      return presentation.t('agent.terminal.timeline.diagnostic.completeMissingItem');
    case 'timeline-complete-identity-mismatch':
      return presentation.t('agent.terminal.timeline.diagnostic.completeIdentityMismatch');
    case 'timeline-duplicate-item-revision':
      return presentation.t('agent.terminal.timeline.diagnostic.duplicateItemRevision');
    case 'timeline-stale-item-revision':
      return presentation.t('agent.terminal.timeline.diagnostic.staleItemRevision');
    case 'unknown-parent-item-anchor':
      return presentation.t('agent.terminal.timeline.diagnostic.unknownParentItem');
    case undefined:
      throw new Error('Owned timeline diagnostic is missing diagnosticCode.');
    default:
      throw new Error(`Unsupported owned timeline diagnostic code: ${code}`);
  }
}
