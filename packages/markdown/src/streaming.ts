import type { MarkdownDiagnostic } from './diagnostics';
import type { NormalizedMarkdownDocument } from './document';
import {
  createMarkdownRevision,
  createMarkdownSessionId,
  type MarkdownRevision,
  type MarkdownSessionId,
} from './identity';
import type { MarkdownNode } from './nodes';
import {
  DEFAULT_MARKDOWN_PARSE_POLICY,
  parseNormalizedMarkdown,
  type MarkdownParsePolicy,
  type ParseNormalizedMarkdownOptions,
} from './parser';
import {
  createMarkdownSourceRange,
  MarkdownContractError,
  type MarkdownSourceRange,
} from './source-range';

export interface MarkdownStreamingSnapshot {
  readonly sessionId: MarkdownSessionId;
  readonly revision: MarkdownRevision;
  readonly source: string;
  readonly document: NormalizedMarkdownDocument;
  readonly stableEndOffset: number;
  readonly mutableRange: MarkdownSourceRange;
  readonly isFinal: boolean;
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export interface MarkdownStreamingFailure {
  readonly status: 'failed';
  readonly sessionId: MarkdownSessionId;
  readonly revision: MarkdownRevision;
  readonly source: string;
  readonly isFinal: boolean;
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export interface MarkdownStreamingReady {
  readonly status: 'ready';
  readonly snapshot: MarkdownStreamingSnapshot;
}

export type MarkdownStreamingResult = MarkdownStreamingReady | MarkdownStreamingFailure;

export interface MarkdownStreamingSessionOptions extends Omit<
  ParseNormalizedMarkdownOptions,
  'sessionId' | 'revision' | 'policy'
> {
  readonly sessionId?: MarkdownSessionId;
  readonly policy?: MarkdownParsePolicy;
}

export class MarkdownStreamingSession {
  readonly #sessionId: MarkdownSessionId;
  readonly #policy: MarkdownParsePolicy;
  readonly #parseOptions: Omit<ParseNormalizedMarkdownOptions, 'sessionId' | 'revision' | 'policy'>;
  #source = '';
  #revisionNumber = 0;
  #finalized = false;
  #lastSnapshot: MarkdownStreamingSnapshot | undefined;

  public constructor(options: MarkdownStreamingSessionOptions = {}) {
    this.#sessionId = options.sessionId ?? createMarkdownSessionId();
    this.#policy = options.policy ?? DEFAULT_MARKDOWN_PARSE_POLICY;
    this.#parseOptions = {
      ...(options.promptSpans ? { promptSpans: options.promptSpans } : {}),
      ...(options.creativeTableKnownColumns
        ? { creativeTableKnownColumns: options.creativeTableKnownColumns }
        : {}),
    };
  }

  public get sessionId(): MarkdownSessionId {
    return this.#sessionId;
  }

  public get source(): string {
    return this.#source;
  }

  public get isFinalized(): boolean {
    return this.#finalized;
  }

  public append(delta: string): MarkdownStreamingResult {
    if (this.#finalized)
      throw new MarkdownContractError('Cannot append to a finalized Markdown session.');
    if (delta.length === 0 && this.#lastSnapshot)
      return { status: 'ready', snapshot: this.#lastSnapshot };
    this.#source += delta;
    return this.#parseCurrent(false);
  }

  public updateSource(latestSource: string): MarkdownStreamingResult {
    if (this.#finalized)
      throw new MarkdownContractError('Cannot update a finalized Markdown session.');
    if (!latestSource.startsWith(this.#source)) {
      throw new MarkdownContractError('Markdown streaming source updates must be append-only.');
    }
    this.#source = latestSource;
    return this.#parseCurrent(false);
  }

  public finalize(finalSource?: string): MarkdownStreamingResult {
    if (this.#finalized)
      throw new MarkdownContractError('Markdown session has already been finalized.');
    if (finalSource !== undefined) {
      if (!finalSource.startsWith(this.#source)) {
        throw new MarkdownContractError(
          'Markdown final source must extend the accumulated streaming source.',
        );
      }
      this.#source = finalSource;
    }
    this.#finalized = true;
    return this.#parseCurrent(true);
  }

  #parseCurrent(isFinal: boolean): MarkdownStreamingResult {
    this.#revisionNumber += 1;
    const revision = createMarkdownRevision(this.#revisionNumber);
    const result = parseNormalizedMarkdown(this.#source, {
      ...this.#parseOptions,
      sessionId: this.#sessionId,
      revision,
      policy: this.#policy,
    });
    if (result.status === 'failed') {
      return {
        status: 'failed',
        sessionId: this.#sessionId,
        revision,
        source: this.#source,
        isFinal,
        diagnostics: result.diagnostics,
      };
    }

    const stableEndOffset = determineStableEndOffset(result.document, isFinal);
    if (this.#lastSnapshot && stableEndOffset < this.#lastSnapshot.stableEndOffset) {
      throw new MarkdownContractError(
        `Markdown stable prefix regressed from ${this.#lastSnapshot.stableEndOffset} to ${stableEndOffset}.`,
      );
    }
    if (this.#lastSnapshot) {
      assertStableIdentity(this.#lastSnapshot, result.document, stableEndOffset);
    }
    const snapshot: MarkdownStreamingSnapshot = {
      sessionId: this.#sessionId,
      revision,
      source: this.#source,
      document: result.document,
      stableEndOffset,
      mutableRange: createMarkdownSourceRange(
        stableEndOffset,
        this.#source.length,
        this.#source.length,
      ),
      isFinal,
      diagnostics: result.document.diagnostics,
    };
    this.#lastSnapshot = snapshot;
    return { status: 'ready', snapshot };
  }
}

function determineStableEndOffset(document: NormalizedMarkdownDocument, isFinal: boolean): number {
  if (isFinal) return document.source.length;
  const source = document.source;
  const unclosedFenceOffset = findUnclosedFenceOffset(source);
  const children = document.root.children;
  const last = children[children.length - 1];
  if (!last) return 0;

  let candidate: number;
  const trailingBlankLine = /(?:\r?\n)[\t ]*(?:\r?\n)$/u.test(source);
  if (last.type === 'table' && !trailingBlankLine) {
    candidate = last.range.startOffset;
  } else if (trailingBlankLine) {
    candidate = source.length;
  } else {
    candidate = last.range.startOffset;
  }
  return unclosedFenceOffset === undefined ? candidate : Math.min(candidate, unclosedFenceOffset);
}

function findUnclosedFenceOffset(source: string): number | undefined {
  const linePattern = /(^|\n)( {0,3})(`{3,}|~{3,})[^\n]*(?=\n|$)/gu;
  let active:
    { readonly marker: '`' | '~'; readonly length: number; readonly offset: number } | undefined;
  for (const match of source.matchAll(linePattern)) {
    const fence = match[3];
    if (!fence) continue;
    const marker = fence[0];
    if (marker !== '`' && marker !== '~') continue;
    const offset = (match.index ?? 0) + (match[1]?.length ?? 0);
    if (!active) {
      active = { marker, length: fence.length, offset };
      continue;
    }
    if (active.marker === marker && fence.length >= active.length) active = undefined;
  }
  return active?.offset;
}

function assertStableIdentity(
  previous: MarkdownStreamingSnapshot,
  current: NormalizedMarkdownDocument,
  currentStableEndOffset: number,
): void {
  const comparableEnd = Math.min(previous.stableEndOffset, currentStableEndOffset);
  const previousNodes = indexStableNodes(previous.document.root, comparableEnd);
  const currentNodes = indexStableNodes(current.root, comparableEnd);
  for (const [key, previousId] of previousNodes) {
    const currentId = currentNodes.get(key);
    if (currentId !== previousId) {
      throw new MarkdownContractError(`Stable Markdown node identity changed for ${key}.`);
    }
  }
}

function indexStableNodes(
  root: MarkdownNode,
  stableEndOffset: number,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  visit(root);
  return result;

  function visit(node: MarkdownNode): void {
    if (node.type !== 'root' && node.range.endOffset <= stableEndOffset) {
      result.set(`${node.type}:${node.range.startOffset}:${node.range.endOffset}`, node.id);
    }
    if ('children' in node) {
      for (const child of node.children) visit(child);
    }
  }
}
