import {
  assertTextEditorMarkdownReferenceSearchRequest,
  isTextEditorMarkdownReferenceCandidate,
  textEditorMarkdownReferenceIdentityKey,
  TextEditorMarkdownReferenceContractError,
  type TextEditorMarkdownReferenceCandidate,
  type TextEditorMarkdownReferenceDiagnostic,
  type TextEditorMarkdownReferenceSearchProjection,
  type TextEditorMarkdownReferenceSearchRequest,
  type TextEditorMarkdownReferenceSource,
} from './markdown-reference-catalog-contract';

export interface TextEditorMarkdownReferenceContributor {
  readonly source: TextEditorMarkdownReferenceSource;
  search(
    request: TextEditorMarkdownReferenceSearchRequest,
    signal: AbortSignal,
  ): Promise<readonly TextEditorMarkdownReferenceCandidate[]>;
}

export type TextEditorMarkdownReferenceSearchResult =
  | {
      readonly status: 'ready';
      readonly projection: TextEditorMarkdownReferenceSearchProjection;
    }
  | {
      readonly status: 'discarded';
      readonly reason: 'cancelled' | 'stale';
    };

export interface TextEditorMarkdownReferenceSearchOptions {
  readonly signal: AbortSignal;
  readonly isCurrent?: (request: TextEditorMarkdownReferenceSearchRequest) => boolean;
}

export class TextEditorMarkdownReferenceCatalog {
  private readonly contributors: readonly TextEditorMarkdownReferenceContributor[];

  constructor(contributors: readonly TextEditorMarkdownReferenceContributor[]) {
    const sources = new Set<TextEditorMarkdownReferenceSource>();
    for (const contributor of contributors) {
      if (sources.has(contributor.source)) {
        throw new TextEditorMarkdownReferenceContractError(
          `Duplicate Text Editor Markdown reference contributor '${contributor.source}'.`,
        );
      }
      sources.add(contributor.source);
    }
    this.contributors = Object.freeze([...contributors]);
  }

  async search(
    request: TextEditorMarkdownReferenceSearchRequest,
    options: TextEditorMarkdownReferenceSearchOptions,
  ): Promise<TextEditorMarkdownReferenceSearchResult> {
    assertTextEditorMarkdownReferenceSearchRequest(request);
    if (options.signal.aborted) return { status: 'discarded', reason: 'cancelled' };
    if (options.isCurrent?.(request) === false) return { status: 'discarded', reason: 'stale' };

    const settled = await Promise.allSettled(
      this.contributors.map(async (contributor) => ({
        source: contributor.source,
        candidates: await contributor.search(request, options.signal),
      })),
    );
    if (options.signal.aborted) return { status: 'discarded', reason: 'cancelled' };
    if (options.isCurrent?.(request) === false) return { status: 'discarded', reason: 'stale' };

    const diagnostics: TextEditorMarkdownReferenceDiagnostic[] = [];
    const candidates: TextEditorMarkdownReferenceCandidate[] = [];
    for (let index = 0; index < settled.length; index += 1) {
      const outcome = settled[index];
      const contributor = this.contributors[index];
      if (!outcome || !contributor) {
        throw new TextEditorMarkdownReferenceContractError(
          'Text Editor Markdown reference contributor result association failed.',
        );
      }
      if (outcome.status === 'rejected') {
        diagnostics.push({
          code: 'text-editor-markdown-reference-contributor-failed',
          source: contributor.source,
        });
        continue;
      }
      for (const candidate of outcome.value.candidates) {
        if (
          !isTextEditorMarkdownReferenceCandidate(candidate) ||
          candidate.source !== contributor.source ||
          !candidateMatchesQueryKind(candidate, request.kind)
        ) {
          diagnostics.push({
            code: 'text-editor-markdown-reference-invalid-candidate',
            source: contributor.source,
            ...(isTextEditorMarkdownReferenceCandidate(candidate)
              ? { candidateRef: candidate.ref }
              : {}),
          });
          continue;
        }
        candidates.push(candidate);
      }
    }

    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      const key = textEditorMarkdownReferenceIdentityKey(candidate.source, candidate.ref);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const uniqueCandidates = candidates.filter((candidate) => {
      const key = textEditorMarkdownReferenceIdentityKey(candidate.source, candidate.ref);
      if (counts.get(key) === 1) return true;
      if (!diagnostics.some((diagnostic) => diagnosticKey(diagnostic) === key)) {
        diagnostics.push({
          code: 'text-editor-markdown-reference-duplicate-candidate',
          source: candidate.source,
          candidateRef: candidate.ref,
        });
      }
      return false;
    });

    return {
      status: 'ready',
      projection: {
        requestId: request.requestId,
        identity: request.identity,
        sessionId: request.sessionId,
        editSequence: request.editSequence,
        kind: request.kind,
        query: request.query,
        candidates: uniqueCandidates.slice(0, request.limit),
        diagnostics,
      },
    };
  }
}

function candidateMatchesQueryKind(
  candidate: TextEditorMarkdownReferenceCandidate,
  kind: TextEditorMarkdownReferenceSearchRequest['kind'],
): boolean {
  if (kind === 'mention') return candidate.kind === 'mention';
  if (candidate.kind !== 'resource') return false;
  return kind === 'resource-link' || candidate.embeddable;
}

function diagnosticKey(diagnostic: TextEditorMarkdownReferenceDiagnostic): string | undefined {
  return diagnostic.candidateRef
    ? textEditorMarkdownReferenceIdentityKey(diagnostic.source, diagnostic.candidateRef)
    : undefined;
}
