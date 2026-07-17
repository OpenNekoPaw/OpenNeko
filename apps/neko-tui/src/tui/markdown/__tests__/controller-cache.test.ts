import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarkdownRevision, MarkdownSessionId } from '@neko/markdown';
import { createTestTerminalMarkdownMessages } from '../../presentation/testing';
import { DeterministicLruCache } from '../cache';
import { TerminalMarkdownController } from '../controller';
import type {
  TerminalCodeHighlighter,
  TerminalHighlightRequest,
  TerminalHighlightResult,
} from '../highlighter';
import {
  subscribeTerminalMarkdownPathEvents,
  type TerminalMarkdownPathEvent,
} from '../path-observer';
import { DEFAULT_MARKDOWN_RESOURCE_POLICY } from '../resource-policy';
import type { TerminalResourceTargetResolver } from '../resource-target';

const labels = createTestTerminalMarkdownMessages('en');

afterEach(() => vi.useRealTimers());

describe('TerminalMarkdownController', () => {
  it('coalesces every non-final source update and applies only the latest source per window', () => {
    const scheduled: Array<() => void> = [];
    const events: TerminalMarkdownPathEvent[] = [];
    const unsubscribe = subscribeTerminalMarkdownPathEvents((event) => events.push(event));
    const controller = new TerminalMarkdownController({
      key: 'coalesce',
      source: '',
      isFinal: false,
      viewportWidth: 40,
      supportsUnicode: true,
      labels,
      schedule(callback) {
        scheduled.push(callback);
        return scheduled.length as unknown as ReturnType<typeof setTimeout>;
      },
      cancelScheduled() {
        // The source coalescing callback has not started in this deterministic fixture.
      },
    });

    controller.updateSource('a', false);
    controller.updateSource('ab', false);
    controller.updateSource('abc', false);

    expect(controller.getSnapshot().source).toBe('');
    expect(scheduled).toHaveLength(1);
    expect(events.filter((event) => event.type === 'source-update-coalesced')).toHaveLength(3);
    expect(events.filter((event) => event.type === 'source-updated')).toHaveLength(1);

    scheduled[0]?.();

    expect(controller.getSnapshot().source).toBe('abc');
    expect(events.filter((event) => event.type === 'source-updated')).toHaveLength(2);

    controller.dispose();
    unsubscribe();
  });

  it('finalizes the latest pending source immediately on the same session', () => {
    vi.useFakeTimers();
    const controller = new TerminalMarkdownController({
      key: 'finalize-pending',
      source: '',
      isFinal: false,
      viewportWidth: 40,
      supportsUnicode: true,
      labels,
      policy: {
        ...DEFAULT_MARKDOWN_RESOURCE_POLICY,
        streamingCoalesceDelayMs: 50,
      },
    });
    controller.updateSource('abcd', false);
    expect(controller.getSnapshot().source).toBe('');
    controller.updateSource('abcd', true);
    expect(controller.getSnapshot()).toMatchObject({ source: 'abcd', isFinal: true });
    const finalizedResult = controller.getSnapshot().result;
    expect(finalizedResult.status).toBe('ready');
    if (finalizedResult.status === 'ready') {
      expect(finalizedResult.snapshot.isFinal).toBe(true);
    }
    vi.runAllTimers();
    expect(controller.getSnapshot().source).toBe('abcd');
    controller.dispose();
    vi.useRealTimers();
  });

  it('coalesces resize without reparsing and discards an older width generation', () => {
    const scheduled: Array<() => void> = [];
    const events: TerminalMarkdownPathEvent[] = [];
    const unsubscribe = subscribeTerminalMarkdownPathEvents((event) => events.push(event));
    const controller = new TerminalMarkdownController({
      key: 'resize',
      source: '| A | B |\n| - | - |\n| one | two |',
      isFinal: true,
      viewportWidth: 80,
      supportsUnicode: true,
      labels,
      schedule(callback) {
        scheduled.push(callback);
        return scheduled.length as unknown as ReturnType<typeof setTimeout>;
      },
      cancelScheduled() {
        // Simulate an already-running layout generation that cannot be cancelled.
      },
    });
    const initialResult = controller.getSnapshot().result;
    const initialRevision =
      initialResult.status === 'ready' ? initialResult.snapshot.revision : undefined;
    controller.requestViewport(40, true);
    controller.requestViewport(12, false);
    scheduled[0]?.();
    expect(controller.getSnapshot().viewportWidth).toBe(80);
    scheduled[1]?.();
    expect(controller.getSnapshot().viewportWidth).toBe(12);
    const finalResult = controller.getSnapshot().result;
    const finalRevision =
      finalResult.status === 'ready' ? finalResult.snapshot.revision : undefined;
    expect(finalRevision).toBe(initialRevision);
    expect(events.some((event) => event.type === 'layout-discarded')).toBe(true);
    expect(events.filter((event) => event.type === 'document-projected')).toHaveLength(1);
    controller.dispose();
    unsubscribe();
  });

  it('bounds revision-associated resource resolutions by entry and node budgets', async () => {
    vi.useFakeTimers();
    const resolver = new CountingTargetResolver();
    const controller = new TerminalMarkdownController({
      key: 'resolution-cache',
      source: '[a](https://a.test)',
      isFinal: false,
      viewportWidth: 40,
      supportsUnicode: true,
      labels,
      targetResolver: resolver,
      policy: {
        ...DEFAULT_MARKDOWN_RESOURCE_POLICY,
        resolutionCacheEntries: 3,
        resolutionCacheNodes: 2,
      },
    });
    expect(controller.cacheStats().resolution).toMatchObject({
      entries: 1,
      weight: 1,
      evictions: 0,
    });
    expect(resolver.invocations).toBe(1);

    controller.updateSource('[a](https://a.test) [b](https://b.test)', false);
    await vi.advanceTimersByTimeAsync(DEFAULT_MARKDOWN_RESOURCE_POLICY.streamingCoalesceDelayMs);
    expect(controller.cacheStats().resolution).toMatchObject({
      entries: 1,
      weight: 2,
      evictions: 1,
    });
    expect(resolver.invocations).toBe(3);
    controller.dispose();
  });

  it('deterministically retains two revisions and evicts the oldest on the third', async () => {
    vi.useFakeTimers();
    const resolver = new CountingTargetResolver();
    const controller = new TerminalMarkdownController({
      key: 'revision-caches',
      source: '[a](https://a.test)',
      isFinal: false,
      viewportWidth: 40,
      supportsUnicode: true,
      labels,
      targetResolver: resolver,
      policy: {
        ...DEFAULT_MARKDOWN_RESOURCE_POLICY,
        parseAssociatedCacheEntries: 2,
        resolutionCacheEntries: 2,
        resolutionCacheNodes: 100,
        projectionCacheEntries: 2,
        layoutCacheEntries: 2,
      },
    });

    expect(controller.cacheStats()).toMatchObject({
      parseAssociated: { entries: 1, evictions: 0 },
      resolution: { entries: 1, evictions: 0 },
      projection: { entries: 1, evictions: 0 },
      layout: { entries: 1, evictions: 0 },
    });
    controller.updateSource('[a](https://a.test) [b](https://b.test)', false);
    await vi.advanceTimersByTimeAsync(DEFAULT_MARKDOWN_RESOURCE_POLICY.streamingCoalesceDelayMs);
    expect(controller.cacheStats()).toMatchObject({
      parseAssociated: { entries: 2, evictions: 0 },
      resolution: { entries: 2, evictions: 0 },
      projection: { entries: 2, evictions: 0 },
      layout: { entries: 2, evictions: 0 },
    });
    controller.updateSource('[a](https://a.test) [b](https://b.test) [c](https://c.test)', false);
    await vi.advanceTimersByTimeAsync(DEFAULT_MARKDOWN_RESOURCE_POLICY.streamingCoalesceDelayMs);
    expect(controller.cacheStats()).toMatchObject({
      parseAssociated: { entries: 2, evictions: 1 },
      resolution: { entries: 2, evictions: 1 },
      projection: { entries: 2, evictions: 1 },
      layout: { entries: 2, evictions: 1 },
    });
    expect(resolver.invocations).toBe(6);
    controller.dispose();
  });

  it('caches deterministic plain highlight results across document revisions', async () => {
    vi.useFakeTimers();
    const highlighter = new CountingPlainHighlighter();
    const source = '```unknown\nvalue\n```';
    const controller = new TerminalMarkdownController({
      key: 'plain-highlight-cache',
      source,
      isFinal: false,
      viewportWidth: 40,
      supportsUnicode: true,
      labels,
      highlighter,
    });
    await Promise.resolve();
    expect(highlighter.requests).toHaveLength(1);

    controller.updateSource(`${source}\n\nmore`, false);
    await Promise.resolve();
    expect(highlighter.requests).toHaveLength(1);
    expect(controller.cacheStats().highlight.entries).toBe(1);
    controller.dispose();
  });

  it('applies whole-block highlight tokens and rejects stale async completion', async () => {
    vi.useFakeTimers();
    const highlighter = new DeferredHighlighter();
    const events: TerminalMarkdownPathEvent[] = [];
    const unsubscribe = subscribeTerminalMarkdownPathEvents((event) => events.push(event));
    const controller = new TerminalMarkdownController({
      key: 'highlight',
      source: '```ts\nconst first = 1;\n```',
      isFinal: false,
      viewportWidth: 12,
      supportsUnicode: true,
      labels,
      highlighter,
    });
    expect(highlighter.requests).toHaveLength(1);
    controller.updateSource('```ts\nconst first = 1;\n```\n\n```ts\nconst second = 2;\n```', false);
    await vi.advanceTimersByTimeAsync(DEFAULT_MARKDOWN_RESOURCE_POLICY.streamingCoalesceDelayMs);
    expect(highlighter.requests.length).toBeGreaterThanOrEqual(3);

    highlighter.resolve(0, highlighted(highlighter.requests[0]));
    await Promise.resolve();
    expect(events.some((event) => event.type === 'highlight-discarded')).toBe(true);

    const latestIndex = highlighter.requests.length - 1;
    highlighter.resolve(latestIndex, highlighted(highlighter.requests[latestIndex]));
    await Promise.resolve();
    const syntaxSegments = controller
      .getSnapshot()
      .layout?.lines.flatMap((line) => line.segments)
      .filter((segment) => segment.style?.syntaxRole === 'keyword');
    expect(syntaxSegments?.length).toBeGreaterThan(0);
    expect(controller.getSnapshot().layout?.lines.some((line) => line.continuation)).toBe(true);

    controller.dispose();
    unsubscribe();
  });
});

describe('DeterministicLruCache', () => {
  it('retains limit minus one and limit, then deterministically evicts oldest at limit plus one', () => {
    const cache = new DeterministicLruCache<string, string>({ maxEntries: 2 });
    cache.set('a', 'A');
    expect(cache.stats()).toMatchObject({ entries: 1, evictions: 0 });
    cache.set('b', 'B');
    expect(cache.stats()).toMatchObject({ entries: 2, evictions: 0 });
    cache.set('c', 'C');
    expect(cache.stats()).toMatchObject({ entries: 2, evictions: 1 });
    expect(cache.keys()).toEqual(['b', 'c']);
  });

  it('enforces estimated-byte weight exactly', () => {
    const cache = new DeterministicLruCache<string, string>({
      maxEntries: 10,
      maxWeight: 4,
      weightOf: (value) => value.length,
    });
    cache.set('below', 'abc');
    expect(cache.stats().weight).toBe(3);
    cache.set('exact', 'd');
    expect(cache.stats().weight).toBe(4);
    cache.set('over', 'e');
    expect(cache.stats()).toMatchObject({ weight: 2, entries: 2, evictions: 1 });
    expect(cache.keys()).toEqual(['exact', 'over']);
  });
});

class CountingTargetResolver implements TerminalResourceTargetResolver {
  invocations = 0;

  resolve(request: Parameters<TerminalResourceTargetResolver['resolve']>[0]) {
    this.invocations += 1;
    return {
      kind: 'web' as const,
      target: request.destination,
      displayTarget: request.destination,
    };
  }
}

class CountingPlainHighlighter implements TerminalCodeHighlighter {
  readonly requests: TerminalHighlightRequest[] = [];

  async highlight(request: TerminalHighlightRequest): Promise<TerminalHighlightResult> {
    this.requests.push(request);
    return {
      status: 'plain',
      sessionId: request.sessionId,
      revision: request.revision,
      generation: request.generation,
      code: request.code,
      reason: 'unknown-language',
      diagnostics: [],
    };
  }
}

class DeferredHighlighter implements TerminalCodeHighlighter {
  readonly requests: TerminalHighlightRequest[] = [];
  readonly #resolvers: Array<(result: TerminalHighlightResult) => void> = [];

  highlight(request: TerminalHighlightRequest): Promise<TerminalHighlightResult> {
    this.requests.push(request);
    return new Promise((resolve) => this.#resolvers.push(resolve));
  }

  resolve(index: number, result: TerminalHighlightResult): void {
    const resolve = this.#resolvers[index];
    if (resolve === undefined) throw new Error(`Missing highlighter resolver ${index}.`);
    resolve(result);
  }
}

function highlighted(request: TerminalHighlightRequest | undefined): TerminalHighlightResult {
  if (request === undefined) throw new Error('Missing highlight request.');
  return {
    status: 'highlighted',
    sessionId: request.sessionId as MarkdownSessionId,
    revision: request.revision as MarkdownRevision,
    generation: request.generation,
    language: request.language ?? 'typescript',
    code: request.code,
    tokens: [
      {
        text: request.code,
        role: 'keyword',
        sourceRange: { startOffset: 0, endOffset: request.code.length },
      },
    ],
    diagnostics: [],
  };
}
