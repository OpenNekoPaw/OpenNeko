import {
  MarkdownStreamingSession,
  type MarkdownNode,
  type MarkdownNodeId,
  type MarkdownStreamingResult,
} from '@neko/markdown';
import type { TerminalMarkdownMessages } from '../presentation/terminal-label-presentation';
import { DeterministicLruCache, type DeterministicCacheStats } from './cache';
import type { TerminalMarkdownDiagnostic } from './contracts';
import {
  acceptTerminalHighlightResult,
  LowlightTerminalCodeHighlighter,
  normalizeHighlightLanguage,
  type TerminalCodeHighlighter,
  type TerminalHighlightedCode,
  type TerminalPlainCode,
} from './highlighter';
import { layoutTerminalMarkdown } from './layout';
import { emitTerminalMarkdownPathEvent } from './path-observer';
import { projectTerminalMarkdown } from './projector';
import { DEFAULT_MARKDOWN_RESOURCE_POLICY, type MarkdownResourcePolicy } from './resource-policy';
import {
  createSnapshotTerminalResourceTargetResolver,
  defaultTerminalResourceTargetResolver,
  resolveTerminalResourceTargets,
  type TerminalResourceResolutionSnapshot,
  type TerminalResourceTargetResolver,
} from './resource-target';
import type {
  TerminalCodeToken,
  TerminalMarkdownLayout,
  TerminalMarkdownProjection,
} from './terminal-blocks';

export interface TerminalMarkdownControllerOptions {
  readonly key: string;
  readonly source: string;
  readonly isFinal: boolean;
  readonly viewportWidth: number;
  readonly supportsUnicode: boolean;
  readonly labels: TerminalMarkdownMessages;
  readonly policy?: MarkdownResourcePolicy;
  readonly targetResolver?: TerminalResourceTargetResolver;
  readonly highlighter?: TerminalCodeHighlighter;
  readonly schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly cancelScheduled?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface TerminalMarkdownControllerSnapshot {
  readonly key: string;
  readonly source: string;
  readonly isFinal: boolean;
  readonly result: MarkdownStreamingResult;
  readonly projection?: TerminalMarkdownProjection;
  readonly layout?: TerminalMarkdownLayout;
  readonly viewportWidth: number;
  readonly supportsUnicode: boolean;
  readonly layoutGeneration: number;
  readonly presentationVersion: number;
}

export interface TerminalMarkdownControllerCacheStats {
  readonly parseAssociated: DeterministicCacheStats;
  readonly resolution: DeterministicCacheStats;
  readonly projection: DeterministicCacheStats;
  readonly layout: DeterministicCacheStats;
  readonly highlight: DeterministicCacheStats;
}

type Listener = () => void;

export class TerminalMarkdownController {
  readonly #key: string;
  readonly #labels: TerminalMarkdownMessages;
  readonly #policy: MarkdownResourcePolicy;
  readonly #targetResolver: TerminalResourceTargetResolver;
  readonly #highlighter: TerminalCodeHighlighter;
  readonly #schedule: NonNullable<TerminalMarkdownControllerOptions['schedule']>;
  readonly #cancelScheduled: NonNullable<TerminalMarkdownControllerOptions['cancelScheduled']>;
  readonly #session = new MarkdownStreamingSession();
  readonly #listeners = new Set<Listener>();
  readonly #parseAssociatedCache: DeterministicLruCache<number, MarkdownStreamingResult>;
  readonly #resolutionCache: DeterministicLruCache<string, TerminalResourceResolutionSnapshot>;
  readonly #projectionCache: DeterministicLruCache<string, TerminalMarkdownProjection>;
  readonly #layoutCache: DeterministicLruCache<string, TerminalMarkdownLayout>;
  readonly #highlightCache: DeterministicLruCache<string, TerminalCachedHighlight>;
  readonly #highlightTokens = new Map<MarkdownNodeId, readonly TerminalCodeToken[]>();
  readonly #highlightDiagnostics = new Map<MarkdownNodeId, readonly TerminalMarkdownDiagnostic[]>();
  readonly #highlightAbortControllers = new Set<AbortController>();
  #snapshot: TerminalMarkdownControllerSnapshot;
  #latestRequestedSource: string;
  #pendingSource: string | undefined;
  #pendingSourceHandle: ReturnType<typeof setTimeout> | undefined;
  #pendingLayoutHandle: ReturnType<typeof setTimeout> | undefined;
  #layoutGeneration = 0;
  #highlightGeneration = 0;
  #presentationVersion = 0;
  #disposed = false;

  public constructor(options: TerminalMarkdownControllerOptions) {
    this.#key = options.key;
    this.#labels = options.labels;
    this.#policy = options.policy ?? DEFAULT_MARKDOWN_RESOURCE_POLICY;
    this.#targetResolver = options.targetResolver ?? defaultTerminalResourceTargetResolver;
    this.#highlighter = options.highlighter ?? new LowlightTerminalCodeHighlighter(this.#policy);
    this.#schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.#cancelScheduled = options.cancelScheduled ?? ((handle) => clearTimeout(handle));
    this.#parseAssociatedCache = new DeterministicLruCache({
      maxEntries: this.#policy.parseAssociatedCacheEntries,
    });
    this.#resolutionCache = new DeterministicLruCache({
      maxEntries: this.#policy.resolutionCacheEntries,
      maxWeight: this.#policy.resolutionCacheNodes,
      weightOf: (snapshot) => snapshot.nodeCount,
    });
    this.#projectionCache = new DeterministicLruCache({
      maxEntries: this.#policy.projectionCacheEntries,
    });
    this.#layoutCache = new DeterministicLruCache({ maxEntries: this.#policy.layoutCacheEntries });
    this.#highlightCache = new DeterministicLruCache({
      maxEntries: Number.MAX_SAFE_INTEGER,
      maxWeight: this.#policy.highlightCacheBytes,
      weightOf: (value) => estimateHighlightWeight(value),
    });

    emitTerminalMarkdownPathEvent({ type: 'session-created', key: this.#key });
    const result = options.isFinal
      ? this.#session.finalize(options.source)
      : this.#session.updateSource(options.source);
    emitTerminalMarkdownPathEvent({
      type: 'source-updated',
      key: this.#key,
      sourceLength: options.source.length,
    });
    this.#latestRequestedSource = options.source;
    this.#snapshot = {
      key: this.#key,
      source: options.source,
      isFinal: options.isFinal,
      result,
      viewportWidth: positiveWidth(options.viewportWidth),
      supportsUnicode: options.supportsUnicode,
      layoutGeneration: this.#layoutGeneration,
      presentationVersion: this.#presentationVersion,
    };
    this.#recordResult(result);
    this.#rebuildPresentation();
    this.#beginHighlighting();
    this.#emitFinalized(result);
  }

  public readonly getSnapshot = (): TerminalMarkdownControllerSnapshot => this.#snapshot;

  public readonly subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  public updateSource(source: string, isFinal: boolean): void {
    this.#assertActive();
    if (source === this.#latestRequestedSource && isFinal === this.#snapshot.isFinal) return;
    if (!source.startsWith(this.#latestRequestedSource)) {
      throw new Error('Assistant Markdown source must remain append-only within a session.');
    }
    if (this.#snapshot.isFinal) {
      throw new Error('Assistant Markdown source cannot change after finalization.');
    }
    this.#latestRequestedSource = source;

    if (isFinal) {
      this.#cancelPendingSource();
      this.#applySource(source, true);
      return;
    }

    this.#pendingSource = source;
    emitTerminalMarkdownPathEvent({
      type: 'source-update-coalesced',
      key: this.#key,
      sourceLength: source.length,
    });
    if (this.#pendingSourceHandle !== undefined) return;
    this.#pendingSourceHandle = this.#schedule(() => {
      this.#pendingSourceHandle = undefined;
      const pending = this.#pendingSource;
      this.#pendingSource = undefined;
      if (pending !== undefined && !this.#disposed) this.#applySource(pending, false);
    }, this.#policy.streamingCoalesceDelayMs);
  }

  public requestViewport(viewportWidth: number, supportsUnicode: boolean): void {
    this.#assertActive();
    const width = positiveWidth(viewportWidth);
    if (
      width === this.#snapshot.viewportWidth &&
      supportsUnicode === this.#snapshot.supportsUnicode
    ) {
      return;
    }
    this.#layoutGeneration += 1;
    const generation = this.#layoutGeneration;
    if (this.#pendingLayoutHandle !== undefined) this.#cancelScheduled(this.#pendingLayoutHandle);
    this.#pendingLayoutHandle = this.#schedule(() => {
      this.#pendingLayoutHandle = undefined;
      if (this.#disposed || generation !== this.#layoutGeneration) {
        emitTerminalMarkdownPathEvent({ type: 'layout-discarded', key: this.#key, generation });
        return;
      }
      this.#snapshot = {
        ...this.#snapshot,
        viewportWidth: width,
        supportsUnicode,
        layoutGeneration: generation,
      };
      this.#rebuildLayout();
      this.#notify();
    }, this.#policy.streamingCoalesceDelayMs);
  }

  public cacheStats(): TerminalMarkdownControllerCacheStats {
    return {
      parseAssociated: this.#parseAssociatedCache.stats(),
      resolution: this.#resolutionCache.stats(),
      projection: this.#projectionCache.stats(),
      layout: this.#layoutCache.stats(),
      highlight: this.#highlightCache.stats(),
    };
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelPendingSource();
    if (this.#pendingLayoutHandle !== undefined) {
      this.#cancelScheduled(this.#pendingLayoutHandle);
      this.#pendingLayoutHandle = undefined;
    }
    this.#abortHighlights();
    this.#listeners.clear();
  }

  #applySource(source: string, isFinal: boolean): void {
    const result = isFinal ? this.#session.finalize(source) : this.#session.updateSource(source);
    emitTerminalMarkdownPathEvent({
      type: 'source-updated',
      key: this.#key,
      sourceLength: source.length,
    });
    this.#snapshot = { ...this.#snapshot, source, isFinal, result };
    this.#recordResult(result);
    this.#presentationVersion += 1;
    this.#snapshot = { ...this.#snapshot, presentationVersion: this.#presentationVersion };
    this.#rebuildPresentation();
    this.#beginHighlighting();
    this.#emitFinalized(result);
    this.#notify();
  }

  #recordResult(result: MarkdownStreamingResult): void {
    const revision =
      result.status === 'ready' ? Number(result.snapshot.revision) : Number(result.revision);
    this.#parseAssociatedCache.set(revision, result);
  }

  #rebuildPresentation(): void {
    const result = this.#snapshot.result;
    if (result.status === 'failed') {
      this.#snapshot = { ...this.#snapshot, projection: undefined, layout: undefined };
      return;
    }
    const revision = Number(result.snapshot.revision);
    const projectionKey = `${revision}:${this.#presentationVersion}`;
    let projection = this.#projectionCache.get(projectionKey);
    if (projection === undefined) {
      const resolutionKey = `${result.snapshot.sessionId}:${revision}`;
      let resolution = this.#resolutionCache.get(resolutionKey);
      if (resolution === undefined) {
        resolution = resolveTerminalResourceTargets(result.snapshot.document, this.#targetResolver);
        this.#resolutionCache.set(resolutionKey, resolution);
      }
      projection = projectTerminalMarkdown(result.snapshot.document, {
        labels: this.#labels,
        targetResolver: createSnapshotTerminalResourceTargetResolver(resolution),
        codeHighlights: this.#highlightTokens,
        presentationDiagnostics: [...this.#highlightDiagnostics.values()].flat(),
      });
      this.#projectionCache.set(projectionKey, projection);
      emitTerminalMarkdownPathEvent({ type: 'document-projected', key: this.#key, revision });
    }
    this.#snapshot = { ...this.#snapshot, projection };
    this.#rebuildLayout();
  }

  #rebuildLayout(): void {
    const projection = this.#snapshot.projection;
    if (projection === undefined) {
      this.#snapshot = { ...this.#snapshot, layout: undefined };
      return;
    }
    const key = `${Number(projection.revision)}:${this.#presentationVersion}:${this.#snapshot.viewportWidth}:${this.#snapshot.supportsUnicode ? 1 : 0}`;
    let layout = this.#layoutCache.get(key);
    if (layout === undefined) {
      layout = layoutTerminalMarkdown(
        {
          projection,
          viewportWidth: this.#snapshot.viewportWidth,
          supportsUnicode: this.#snapshot.supportsUnicode,
        },
        { labels: this.#labels, policy: this.#policy },
      );
      this.#layoutCache.set(key, layout);
      emitTerminalMarkdownPathEvent({
        type: 'layout-created',
        key: this.#key,
        revision: Number(projection.revision),
        viewportWidth: this.#snapshot.viewportWidth,
      });
    }
    this.#snapshot = { ...this.#snapshot, layout };
  }

  #beginHighlighting(): void {
    this.#abortHighlights();
    this.#highlightTokens.clear();
    this.#highlightDiagnostics.clear();
    const result = this.#snapshot.result;
    if (result.status === 'failed') return;

    this.#highlightGeneration += 1;
    const generation = this.#highlightGeneration;
    const revision = result.snapshot.revision;
    const codeNodes = collectCodeNodes(result.snapshot.document.root);
    const pending: Array<{
      readonly nodeId: MarkdownNodeId;
      readonly node: Extract<MarkdownNode, { readonly type: 'codeBlock' }>;
      readonly cacheKey: string;
    }> = [];
    for (const node of codeNodes) {
      const cacheKey = highlightCacheKey(node.value, node.language.normalized);
      const cached = this.#highlightCache.get(cacheKey);
      if (cached?.status === 'highlighted') {
        this.#highlightTokens.set(node.id, cached.tokens);
      } else if (cached?.status === 'plain') {
        this.#highlightDiagnostics.set(node.id, cached.diagnostics);
      } else {
        pending.push({ nodeId: node.id, node, cacheKey });
      }
    }
    if (this.#highlightTokens.size > 0 || this.#highlightDiagnostics.size > 0) {
      this.#presentationVersion += 1;
      this.#snapshot = { ...this.#snapshot, presentationVersion: this.#presentationVersion };
      this.#rebuildPresentation();
    }

    for (const item of pending) {
      const abortController = new AbortController();
      this.#highlightAbortControllers.add(abortController);
      emitTerminalMarkdownPathEvent({
        type: 'highlight-requested',
        key: this.#key,
        revision: Number(revision),
        generation,
      });
      void this.#highlighter
        .highlight({
          sessionId: result.snapshot.sessionId,
          revision,
          generation,
          code: item.node.value,
          ...(item.node.language.normalized ? { language: item.node.language.normalized } : {}),
          signal: abortController.signal,
        })
        .then((candidate) => {
          this.#highlightAbortControllers.delete(abortController);
          if (this.#disposed) return;
          const accepted = acceptTerminalHighlightResult(
            { sessionId: result.snapshot.sessionId, revision, generation },
            candidate,
          );
          const current = this.#snapshot.result;
          if (
            accepted.status === 'discarded' ||
            current.status === 'failed' ||
            current.snapshot.sessionId !== accepted.sessionId ||
            current.snapshot.revision !== accepted.revision ||
            generation !== this.#highlightGeneration
          ) {
            emitTerminalMarkdownPathEvent({
              type: 'highlight-discarded',
              key: this.#key,
              revision: Number(revision),
              generation,
            });
            return;
          }
          if (accepted.status === 'highlighted') {
            this.#highlightCache.set(item.cacheKey, accepted);
            this.#highlightTokens.set(item.nodeId, accepted.tokens);
          } else {
            if (accepted.reason !== 'runtime-failure') {
              this.#highlightCache.set(item.cacheKey, accepted);
            }
            this.#highlightDiagnostics.set(item.nodeId, accepted.diagnostics);
          }
          this.#presentationVersion += 1;
          this.#snapshot = { ...this.#snapshot, presentationVersion: this.#presentationVersion };
          this.#rebuildPresentation();
          emitTerminalMarkdownPathEvent({
            type: 'highlight-applied',
            key: this.#key,
            revision: Number(revision),
            generation,
          });
          this.#notify();
        });
    }
  }

  #abortHighlights(): void {
    for (const controller of this.#highlightAbortControllers) controller.abort();
    this.#highlightAbortControllers.clear();
  }

  #cancelPendingSource(): void {
    this.#pendingSource = undefined;
    if (this.#pendingSourceHandle !== undefined) {
      this.#cancelScheduled(this.#pendingSourceHandle);
      this.#pendingSourceHandle = undefined;
    }
  }

  #emitFinalized(result: MarkdownStreamingResult): void {
    if (result.status !== 'ready' || !result.snapshot.isFinal) return;
    emitTerminalMarkdownPathEvent({
      type: 'session-finalized',
      key: this.#key,
      revision: Number(result.snapshot.revision),
    });
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('TerminalMarkdownController has been disposed.');
  }
}

function collectCodeNodes(
  node: MarkdownNode,
): readonly Extract<MarkdownNode, { readonly type: 'codeBlock' }>[] {
  const output: Array<Extract<MarkdownNode, { readonly type: 'codeBlock' }>> = [];
  visit(node);
  return output;

  function visit(current: MarkdownNode): void {
    if (current.type === 'codeBlock') output.push(current);
    if ('children' in current) {
      for (const child of current.children) visit(child);
    }
  }
}

function highlightCacheKey(code: string, language: string | undefined): string {
  return `${normalizeHighlightLanguage(language) ?? ''}\u0000${code}`;
}

type TerminalCachedHighlight = TerminalHighlightedCode | TerminalPlainCode;

function estimateHighlightWeight(value: TerminalCachedHighlight): number {
  const tokenWeight = value.status === 'highlighted' ? value.tokens.length * 32 : 0;
  return (
    new TextEncoder().encode(value.code).byteLength + tokenWeight + value.diagnostics.length * 64
  );
}

function positiveWidth(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`viewportWidth must be positive, received ${value}.`);
  }
  return value;
}
