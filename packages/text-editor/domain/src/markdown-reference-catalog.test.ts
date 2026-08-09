import { describe, expect, it, vi } from 'vitest';
import type { TextDocumentIdentity } from './contracts';
import {
  isTextEditorMarkdownReferenceCandidate,
  TextEditorMarkdownReferenceContractError,
  type TextEditorMarkdownReferenceCandidate,
  type TextEditorMarkdownReferenceSearchRequest,
  type TextEditorMarkdownReferenceSource,
} from './markdown-reference-catalog-contract';
import {
  TextEditorMarkdownReferenceCatalog,
  type TextEditorMarkdownReferenceContributor,
} from './markdown-reference-catalog';

const identity: TextDocumentIdentity = {
  owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
  workspaceId: 'workspace-1',
  documentId: 'notes/draft.md',
  locator: { kind: 'workspace-file', path: 'notes/draft.md' },
};

describe('TextEditorMarkdownReferenceCatalog', () => {
  it('composes exact contributors while preserving duplicate display labels', async () => {
    const catalog = new TextEditorMarkdownReferenceCatalog([
      contributor('workspace-file', [mention('workspace-file', 'file-1', '小橘')]),
      contributor('entity', [mention('entity', 'entity-1', '小橘')]),
      contributor('asset', [mention('asset', 'asset-1', '封面')]),
    ]);

    const result = await catalog.search(request('mention', '小'), active());

    expect(result).toEqual({
      status: 'ready',
      projection: expect.objectContaining({
        requestId: 'request-1',
        identity,
        sessionId: 'session-1',
        editSequence: 3,
        kind: 'mention',
        query: '小',
        candidates: [
          expect.objectContaining({ source: 'workspace-file', label: '小橘' }),
          expect.objectContaining({ source: 'entity', label: '小橘' }),
          expect.objectContaining({ source: 'asset', label: '封面' }),
        ],
        diagnostics: [],
      }),
    });
  });

  it('contains a failed contributor and preserves valid siblings', async () => {
    const failed = contributor('entity', []);
    failed.search = vi.fn(async () => {
      throw new Error('entity-index-unavailable');
    });
    const catalog = new TextEditorMarkdownReferenceCatalog([
      contributor('workspace-file', [resource('workspace-file', 'file-1', true)]),
      failed,
      contributor('asset', [resource('asset', 'asset-1', true)]),
    ]);

    const result = await catalog.search(request('resource-embed', ''), active());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected ready catalog projection.');
    expect(result.projection.candidates.map((candidate) => candidate.source)).toEqual([
      'workspace-file',
      'asset',
    ]);
    expect(result.projection.diagnostics).toEqual([
      {
        code: 'text-editor-markdown-reference-contributor-failed',
        source: 'entity',
      },
    ]);
  });

  it('rejects every duplicate stable identity instead of selecting by contributor order', async () => {
    const duplicate = resource('asset', 'asset-1', true);
    const catalog = new TextEditorMarkdownReferenceCatalog([
      contributor('asset', [duplicate, { ...duplicate, label: '另一个标签' }]),
    ]);

    const result = await catalog.search(request('resource-link', ''), active());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected ready catalog projection.');
    expect(result.projection.candidates).toEqual([]);
    expect(result.projection.diagnostics).toEqual([
      {
        code: 'text-editor-markdown-reference-duplicate-candidate',
        source: 'asset',
        candidateRef: duplicate.ref,
      },
    ]);
  });

  it('rejects invalid and cross-contributor candidates without clearing valid siblings', async () => {
    const invalidTarget = {
      ...resource('workspace-file', 'invalid', true),
      target: 'file:///tmp/private.png',
    };
    const wrongSource = mention('entity', 'wrong-source', '角色');
    const valid = resource('workspace-file', 'valid', true);
    const catalog = new TextEditorMarkdownReferenceCatalog([
      contributor('workspace-file', [
        invalidTarget as TextEditorMarkdownReferenceCandidate,
        wrongSource,
        valid,
      ]),
    ]);

    const result = await catalog.search(request('resource-embed', ''), active());

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected ready catalog projection.');
    expect(result.projection.candidates).toEqual([valid]);
    expect(result.projection.diagnostics).toHaveLength(2);
    expect(result.projection.diagnostics.every((item) => item.source === 'workspace-file')).toBe(
      true,
    );
  });

  it('discards cancelled and stale requests without publishing contributor results', async () => {
    const controller = new AbortController();
    controller.abort();
    const search = vi.fn(async () => [mention('entity', 'entity-1', '小橘')]);
    const catalog = new TextEditorMarkdownReferenceCatalog([{ source: 'entity', search }]);

    await expect(
      catalog.search(request('mention', ''), { signal: controller.signal }),
    ).resolves.toEqual({ status: 'discarded', reason: 'cancelled' });
    expect(search).not.toHaveBeenCalled();

    await expect(
      catalog.search(request('mention', ''), {
        signal: new AbortController().signal,
        isCurrent: () => false,
      }),
    ).resolves.toEqual({ status: 'discarded', reason: 'stale' });
    expect(search).not.toHaveBeenCalled();
  });

  it('poisons duplicate contributor registration and malformed request identity', async () => {
    expect(
      () =>
        new TextEditorMarkdownReferenceCatalog([
          contributor('asset', []),
          contributor('asset', []),
        ]),
    ).toThrow("Duplicate Text Editor Markdown reference contributor 'asset'.");

    const catalog = new TextEditorMarkdownReferenceCatalog([]);
    await expect(
      catalog.search(
        {
          ...request('mention', ''),
          identity: {
            ...identity,
            locator: { kind: 'workspace-file', path: 'notes/other.md' },
          },
        },
        active(),
      ),
    ).rejects.toBeInstanceOf(TextEditorMarkdownReferenceContractError);
  });

  it('validates portable resource candidates at the package boundary', () => {
    expect(isTextEditorMarkdownReferenceCandidate(resource('asset', 'asset-1', true))).toBe(true);
    expect(
      isTextEditorMarkdownReferenceCandidate({
        ...resource('asset', 'asset-1', true),
        target: '../outside.png',
      }),
    ).toBe(false);
  });
});

function request(
  kind: TextEditorMarkdownReferenceSearchRequest['kind'],
  query: string,
): TextEditorMarkdownReferenceSearchRequest {
  return {
    requestId: 'request-1',
    identity,
    sessionId: 'session-1',
    editSequence: 3,
    kind,
    query,
    limit: 20,
  };
}

function active() {
  return { signal: new AbortController().signal, isCurrent: () => true };
}

function contributor(
  source: TextEditorMarkdownReferenceSource,
  candidates: readonly TextEditorMarkdownReferenceCandidate[],
): TextEditorMarkdownReferenceContributor {
  return { source, search: vi.fn(async () => candidates) };
}

function mention(
  source: TextEditorMarkdownReferenceSource,
  id: string,
  label: string,
): TextEditorMarkdownReferenceCandidate {
  return { kind: 'mention', source, ref: { kind: source, id }, label };
}

function resource(
  source: TextEditorMarkdownReferenceSource,
  id: string,
  embeddable: boolean,
): TextEditorMarkdownReferenceCandidate {
  return {
    kind: 'resource',
    source,
    ref: { kind: source, id },
    label: `${source}-${id}`,
    target: `assets/${id}.png`,
    embeddable,
  };
}
