import { describe, expect, it } from 'vitest';
import {
  assertMarkdownRangeContained,
  assertMarkdownResolutionAssociation,
  assertMarkdownSourceRange,
  createMarkdownAnnotationId,
  createMarkdownNodeId,
  createMarkdownRevision,
  createMarkdownSessionId,
  createMarkdownSourceRange,
  parseNormalizedMarkdown,
  rangesOverlap,
  validateMarkdownResolutionSnapshot,
  validateNormalizedMarkdownDocument,
  type MarkdownAnnotation,
  type MarkdownResolutionSnapshot,
  type NormalizedMarkdownDocument,
} from '../index';

function readyDocument(
  source: string,
  options: Parameters<typeof parseNormalizedMarkdown>[1] = {},
): NormalizedMarkdownDocument {
  const result = parseNormalizedMarkdown(source, options);
  if (result.status !== 'ready') throw new Error('Expected Markdown parse success.');
  return result.document;
}

describe('normalized Markdown contracts', () => {
  it('uses validated half-open UTF-16 source ranges without clamping', () => {
    expect(createMarkdownSourceRange(0, 2, 2)).toEqual({ startOffset: 0, endOffset: 2 });
    expect(() => assertMarkdownSourceRange({ startOffset: -1, endOffset: 1 }, 2)).toThrow();
    expect(() => assertMarkdownSourceRange({ startOffset: 2, endOffset: 1 }, 2)).toThrow();
    expect(() => assertMarkdownSourceRange({ startOffset: 0, endOffset: 3 }, 2)).toThrow();
    expect(() =>
      assertMarkdownRangeContained(
        { startOffset: 1, endOffset: 3 },
        { startOffset: 0, endOffset: 2 },
      ),
    ).toThrow();
    expect(rangesOverlap({ startOffset: 0, endOffset: 2 }, { startOffset: 1, endOffset: 3 })).toBe(
      true,
    );
    expect(rangesOverlap({ startOffset: 0, endOffset: 1 }, { startOffset: 1, endOffset: 2 })).toBe(
      false,
    );
  });

  it('rejects structurally invalid node ranges, root coverage, and node ID collisions', () => {
    const document = readyDocument('first\n\nsecond');
    const [first, second] = document.root.children;
    if (!first || !second) throw new Error('Expected two block nodes.');

    const invalidContainment: NormalizedMarkdownDocument = {
      ...document,
      root: {
        ...document.root,
        children: [
          {
            ...first,
            range: { startOffset: 0, endOffset: document.source.length + 1 },
            provenance: {
              kind: 'source',
              range: { startOffset: 0, endOffset: document.source.length + 1 },
            },
          },
          second,
        ],
      },
    };
    expect(() => validateNormalizedMarkdownDocument(invalidContainment)).toThrow(
      /outside source length/u,
    );

    const duplicateId: NormalizedMarkdownDocument = {
      ...document,
      root: {
        ...document.root,
        children: [first, { ...second, id: first.id }],
      },
    };
    expect(() => validateNormalizedMarkdownDocument(duplicateId)).toThrow(
      /Duplicate Markdown node ID/u,
    );

    const invalidRoot: NormalizedMarkdownDocument = {
      ...document,
      root: {
        ...document.root,
        range: { startOffset: 1, endOffset: document.source.length },
        provenance: {
          kind: 'source',
          range: { startOffset: 1, endOffset: document.source.length },
        },
      },
    };
    expect(() => validateNormalizedMarkdownDocument(invalidRoot)).toThrow(/root range/u);
  });

  it('allows overlapping annotations while rejecting collisions and invalid provenance', () => {
    const source = '**storm**';
    const document = readyDocument(source, {
      promptSpans: [
        { kind: 'scene', range: { startOffset: 0, endOffset: source.length } },
        { kind: 'tone', range: { startOffset: 2, endOffset: 7 } },
      ],
    });
    expect(document.annotations).toHaveLength(2);
    expect(() => validateNormalizedMarkdownDocument(document)).not.toThrow();

    const [first, second] = document.annotations;
    if (!first || !second) throw new Error('Expected two annotations.');
    const duplicate: NormalizedMarkdownDocument = {
      ...document,
      annotations: [first, { ...second, id: first.id }],
    };
    expect(() => validateNormalizedMarkdownDocument(duplicate)).toThrow(
      /Duplicate Markdown annotation ID/u,
    );

    const syntheticWithoutOrigin: MarkdownAnnotation = {
      ...first,
      provenance: { kind: 'synthetic', operation: 'prompt-projection' },
    };
    expect(() =>
      validateNormalizedMarkdownDocument({
        ...document,
        annotations: [syntheticWithoutOrigin, second],
      }),
    ).toThrow(/must identify an origin/u);

    const unknownTarget: MarkdownAnnotation = {
      ...first,
      targetNodeId: createMarkdownNodeId('md-node:unknown'),
    };
    expect(() =>
      validateNormalizedMarkdownDocument({ ...document, annotations: [unknownTarget, second] }),
    ).toThrow(/targets unknown node/u);
  });

  it('keeps document semantics and contextual resolution snapshots separate', () => {
    const document = readyDocument('@Rin', {
      promptSpans: [{ kind: 'entity', range: { startOffset: 0, endOffset: 4 } }],
    });
    const mention =
      document.root.children[0]?.type === 'paragraph'
        ? document.root.children[0].children.find((node) => node.type === 'nekoMention')
        : undefined;
    const annotation = document.annotations[0];
    if (!mention || !annotation) throw new Error('Expected mention and annotation.');

    const snapshot: MarkdownResolutionSnapshot = {
      sessionId: document.sessionId,
      revision: document.revision,
      resolutions: [
        {
          kind: 'node',
          nodeId: mention.id,
          status: 'resolved',
          ref: { kind: 'entity', id: 'rin' },
          candidates: [],
          authorized: true,
        },
        {
          kind: 'annotation',
          annotationId: annotation.id,
          status: 'unresolved',
          candidates: [],
        },
      ],
      handoffRefs: [],
      diagnostics: [],
    };
    expect(() => validateMarkdownResolutionSnapshot(document, snapshot)).not.toThrow();
    expect(document.root.children[0]).toEqual(document.root.children[0]);

    expect(() =>
      assertMarkdownResolutionAssociation(
        snapshot,
        createMarkdownSessionId('other'),
        document.revision,
      ),
    ).toThrow(/cannot be associated/u);

    expect(() =>
      validateMarkdownResolutionSnapshot(document, {
        ...snapshot,
        resolutions: [
          {
            kind: 'node',
            nodeId: createMarkdownNodeId('md-node:missing'),
            status: 'unresolved',
            candidates: [],
          },
        ],
      }),
    ).toThrow(/unknown node/u);
  });

  it('validates branded identity constructors', () => {
    expect(createMarkdownSessionId('test')).toMatch(/^md-session:/u);
    expect(createMarkdownRevision(1)).toBe(1);
    expect(createMarkdownNodeId('md-node:test')).toBe('md-node:test');
    expect(createMarkdownAnnotationId('md-annotation:test')).toBe('md-annotation:test');
    expect(() => createMarkdownRevision(0)).toThrow();
    expect(() => createMarkdownNodeId('test')).toThrow();
    expect(() => createMarkdownAnnotationId('test')).toThrow();
  });
});

describe('Markdown resolution orchestration', () => {
  it('returns immutable associated snapshots and discards cancellation/stale results', async () => {
    const document = readyDocument('@Rin');
    const mention =
      document.root.children[0]?.type === 'paragraph'
        ? document.root.children[0].children.find((node) => node.type === 'nekoMention')
        : undefined;
    if (!mention) throw new Error('Expected mention.');
    const { resolveMarkdownSnapshot } = await import('../index');
    const resolver = {
      resolve: async () => ({
        resolutions: [
          {
            kind: 'node' as const,
            nodeId: mention.id,
            status: 'resolved' as const,
            ref: { kind: 'entity', id: 'rin' },
            candidates: [],
          },
        ],
        handoffRefs: [],
        diagnostics: [],
      }),
    };

    const ready = await resolveMarkdownSnapshot({ document, context: {}, resolver });
    expect(ready.status).toBe('ready');
    if (ready.status === 'ready') {
      expect(ready.snapshot.sessionId).toBe(document.sessionId);
      expect(ready.snapshot.revision).toBe(document.revision);
      expect(Object.isFrozen(ready.snapshot)).toBe(true);
    }

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      resolveMarkdownSnapshot({
        document,
        context: {},
        resolver,
        signal: aborted.signal,
      }),
    ).resolves.toEqual({ status: 'discarded', reason: 'cancelled' });

    await expect(
      resolveMarkdownSnapshot({
        document,
        context: {},
        resolver,
        isCurrent: () => false,
      }),
    ).resolves.toEqual({ status: 'discarded', reason: 'stale' });
  });
});
