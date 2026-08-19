import type {
  CompletionContext,
  CompletionResult,
  CompletionSection,
} from '@codemirror/autocomplete';
import {
  projectMarkdownAuthoringAssistance,
  type MarkdownAuthoringCandidate,
  type MarkdownDiagnostic,
} from '@neko/markdown';
import type {
  TextDocumentIdentity,
  TextDocumentProjection,
  TextEditorMarkdownReferenceDiagnostic,
  TextEditorMarkdownReferenceSource,
  TextEditorMarkdownReferenceSearchProjection,
  TextEditorMarkdownReferenceSearchRequest,
  TextEditorMarkdownReferenceSearchResult,
} from '@neko/text-editor-domain';
import { textEditorLabel, type TextEditorLocale } from './labels';

export interface MarkdownCompletionSourceOptions {
  readonly locale: TextEditorLocale;
  readonly readProjection: () => TextDocumentProjection;
  readonly nextRequestId: () => string;
  readonly isComposing: () => boolean;
  readonly searchReferences: (
    request: TextEditorMarkdownReferenceSearchRequest,
    signal: AbortSignal,
  ) => Promise<TextEditorMarkdownReferenceSearchResult>;
  readonly reportDiagnostics: (diagnostics: {
    readonly catalog: readonly TextEditorMarkdownReferenceDiagnostic[];
    readonly markdown: readonly MarkdownDiagnostic[];
  }) => void;
}

export function createMarkdownCompletionSource(options: MarkdownCompletionSourceOptions) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    if (options.isComposing()) return null;
    const projection = options.readProjection();
    if (projection.mode !== 'markdown') return null;
    const source = context.state.doc.toString();
    if (source !== projection.source) return null;

    const initial = projectMarkdownAuthoringAssistance({
      source,
      caretOffset: context.pos,
      includeGfmSnippets: context.explicit,
    });
    if (!initial) return null;
    if (initial.context.kind === 'gfm-snippet') {
      options.reportDiagnostics({ catalog: [], markdown: initial.diagnostics });
      return toCompletionResult(initial, options.locale);
    }

    const request: TextEditorMarkdownReferenceSearchRequest = {
      requestId: options.nextRequestId(),
      identity: projection.identity,
      sessionId: projection.sessionId,
      editSequence: projection.editSequence,
      kind: initial.context.kind,
      query: initial.context.query,
      limit: 30,
    };
    const controller = new AbortController();
    context.addEventListener('abort', () => controller.abort(), { onDocChange: true });
    const result = await options.searchReferences(request, controller.signal);
    if (context.aborted || controller.signal.aborted || result.status === 'discarded') return null;
    assertCurrentSearchProjection(request, result.projection);
    if (options.isComposing()) return null;
    const current = options.readProjection();
    if (!searchStillOwnsProjection(request, current)) return null;

    const completed = projectMarkdownAuthoringAssistance({
      source,
      caretOffset: context.pos,
      candidates: result.projection.candidates.map(toMarkdownCandidate),
    });
    if (!completed || completed.context.kind !== request.kind) return null;
    options.reportDiagnostics({
      catalog: result.projection.diagnostics,
      markdown: completed.diagnostics,
    });
    return toCompletionResult(completed, options.locale, result.projection.candidates);
  };
}

function toCompletionResult(
  projection: NonNullable<ReturnType<typeof projectMarkdownAuthoringAssistance>>,
  locale: TextEditorLocale,
  candidates: readonly TextEditorMarkdownReferenceSearchProjection['candidates'][number][] = [],
): CompletionResult {
  const sourceByRef = new Map(
    candidates.map((candidate) => [referenceKey(candidate.ref), candidate.source] as const),
  );
  return {
    from: projection.context.replacementRange.startOffset,
    to: projection.context.replacementRange.endOffset,
    filter: false,
    options: projection.items.map((item) => {
      const source = item.ref ? sourceByRef.get(referenceKey(item.ref)) : undefined;
      const sourceLabel = completionSourceLabel(locale, source, item.kind === 'gfm-snippet');
      return {
        label: item.label,
        apply: item.insertText,
        type: completionType(source, item.kind === 'gfm-snippet'),
        detail: item.detail ? `${sourceLabel} · ${item.detail}` : sourceLabel,
        section: completionSection(locale, source, item.kind === 'gfm-snippet'),
      };
    }),
  };
}

function completionType(
  source: TextEditorMarkdownReferenceSource | undefined,
  syntax: boolean,
): string {
  if (syntax) return 'neko-markdown-syntax';
  if (source === 'entity') return 'neko-entity';
  if (source === 'asset') return 'neko-media-library';
  return 'neko-workspace-file';
}

function completionSection(
  locale: TextEditorLocale,
  source: TextEditorMarkdownReferenceSource | undefined,
  syntax: boolean,
): CompletionSection {
  return {
    name: completionSourceLabel(locale, source, syntax),
    rank: syntax ? 0 : source === 'entity' ? 1 : source === 'workspace-file' ? 2 : 3,
  };
}

function completionSourceLabel(
  locale: TextEditorLocale,
  source: TextEditorMarkdownReferenceSource | undefined,
  syntax: boolean,
): string {
  if (syntax) return textEditorLabel(locale, 'completionSyntax');
  if (source === 'entity') return textEditorLabel(locale, 'completionEntity');
  if (source === 'asset') return textEditorLabel(locale, 'completionMediaLibrary');
  return textEditorLabel(locale, 'completionFile');
}

function referenceKey(ref: {
  readonly kind: string;
  readonly id: string;
  readonly namespace?: string;
}) {
  return `${ref.namespace ?? ''}:${ref.kind}:${ref.id}`;
}

function toMarkdownCandidate(
  candidate: TextEditorMarkdownReferenceSearchProjection['candidates'][number],
): MarkdownAuthoringCandidate {
  if (candidate.kind === 'mention') {
    return {
      kind: 'mention',
      label: candidate.label,
      ...(candidate.detail ? { detail: candidate.detail } : {}),
      ref: candidate.ref,
    };
  }
  return {
    kind: 'resource',
    label: candidate.label,
    target: candidate.target,
    ...(candidate.detail ? { detail: candidate.detail } : {}),
    embeddable: candidate.embeddable,
    ref: candidate.ref,
  };
}

function assertCurrentSearchProjection(
  request: TextEditorMarkdownReferenceSearchRequest,
  projection: TextEditorMarkdownReferenceSearchProjection,
): void {
  if (
    projection.requestId !== request.requestId ||
    projection.sessionId !== request.sessionId ||
    projection.editSequence !== request.editSequence ||
    projection.kind !== request.kind ||
    projection.query !== request.query ||
    !sameDocumentIdentity(projection.identity, request.identity)
  ) {
    throw new Error('Text Editor Markdown reference search projection is stale or mismatched.');
  }
}

function searchStillOwnsProjection(
  request: TextEditorMarkdownReferenceSearchRequest,
  projection: TextDocumentProjection,
): boolean {
  return (
    projection.mode === 'markdown' &&
    projection.sessionId === request.sessionId &&
    projection.editSequence === request.editSequence &&
    sameDocumentIdentity(projection.identity, request.identity)
  );
}

function sameDocumentIdentity(left: TextDocumentIdentity, right: TextDocumentIdentity): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.documentId === right.documentId &&
    left.locator.file.path === right.locator.file.path &&
    left.owner.kind === 'window' &&
    right.owner.kind === 'window' &&
    left.owner.windowId === right.owner.windowId &&
    left.owner.projectId === right.owner.projectId
  );
}
