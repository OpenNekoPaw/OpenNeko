import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalMessageKey } from './terminal-messages';
import {
  TuiReferenceSuggestionError,
  type TuiReferenceLoadingError,
  type TuiReferenceSuggestionDiagnostic,
} from '../core/reference-diagnostics';

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentReferenceLoadingDiagnostics(
  errors: readonly TuiReferenceLoadingError[],
  context: PresentationContext,
): string | undefined {
  if (errors.length === 0) {
    return undefined;
  }

  return [
    context.t(
      errors.length === 1
        ? 'agent.terminal.reference.loadingErrorOne'
        : 'agent.terminal.reference.loadingErrorMany',
    ),
    ...errors.map((error) =>
      context.t('agent.terminal.reference.loadingErrorRow', {
        reference: error.reference,
        detail: error.error,
      }),
    ),
  ].join('\n');
}

export function presentReferenceSuggestionError(
  error: unknown,
  context: PresentationContext,
): string {
  if (!(error instanceof TuiReferenceSuggestionError)) {
    return context.t('agent.terminal.reference.suggestionFailed', {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  return presentReferenceSuggestionDiagnostic(error.diagnostic, context);
}

function presentReferenceSuggestionDiagnostic(
  diagnostic: TuiReferenceSuggestionDiagnostic,
  context: PresentationContext,
): string {
  switch (diagnostic.code) {
    case 'read-failed':
      return context.t('agent.terminal.reference.readFailed', {
        path: diagnostic.filePath,
        detail: diagnostic.detail,
      });
    case 'parse-failed':
      return context.t('agent.terminal.reference.parseFailed', {
        path: diagnostic.filePath,
        detail: diagnostic.detail,
      });
    case 'expected-object':
      return context.t('agent.terminal.reference.expectedObject', { source: diagnostic.source });
    case 'expected-array':
      return context.t('agent.terminal.reference.expectedArray', { source: diagnostic.source });
    case 'expected-entry-object':
      return context.t('agent.terminal.reference.expectedEntryObject', {
        source: diagnostic.source,
        index: diagnostic.index,
      });
    case 'invalid-entry':
      return context.t('agent.terminal.reference.invalidEntry', {
        source: diagnostic.source,
        index: diagnostic.index,
      });
    case 'expected-string-field':
      return context.t('agent.terminal.reference.expectedStringField', {
        source: diagnostic.source,
        field: diagnostic.field,
      });
  }
}
