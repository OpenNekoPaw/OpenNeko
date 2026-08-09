import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import type {
  TextDocumentProjection,
  TextEditorMarkdownReferenceSearchProjection,
  TextEditorMarkdownReferenceSearchRequest,
  TextEditorMarkdownReferenceSearchResult,
} from '@neko/text-editor-domain';
import { describe, expect, it, vi } from 'vitest';
import {
  createMarkdownCompletionSource,
  type MarkdownCompletionSourceOptions,
} from './markdown-completions';

describe('Markdown CodeMirror completion source', () => {
  it('offers canonical GFM snippets on explicit completion without searching the Host', async () => {
    const fixture = createFixture('# Title\n\n');
    const completion = await fixture.complete(fixture.projection.source.length, true);

    expect(completion?.options.map((item) => item.label)).toEqual([
      'Heading',
      'Task list',
      'Table',
      'Fenced code',
    ]);
    expect(fixture.searchReferences).not.toHaveBeenCalled();
  });

  it('requests and maps distinct mention candidates through exact document identity', async () => {
    const fixture = createFixture('参与者：@小');
    fixture.searchReferences.mockImplementation(async (request) =>
      ready(request, [
        {
          kind: 'mention',
          source: 'entity',
          ref: { kind: 'character', id: 'character-1' },
          label: '小橘',
          detail: 'Character',
        },
        {
          kind: 'mention',
          source: 'workspace-file',
          ref: { kind: 'workspace-file', id: 'characters/小橘.md' },
          label: '小橘',
          detail: 'characters/小橘.md',
        },
      ]),
    );

    const completion = await fixture.complete(fixture.projection.source.length);

    expect(fixture.searchReferences).toHaveBeenCalledWith(
      {
        requestId: 'completion-request-1',
        identity: fixture.projection.identity,
        sessionId: 'session-1',
        editSequence: 2,
        kind: 'mention',
        query: '小',
        limit: 30,
      },
      expect.any(AbortSignal),
    );
    expect(completion).toMatchObject({ from: 4, to: 6 });
    expect(completion?.options).toEqual([
      expect.objectContaining({ label: '@小橘', apply: '@小橘', detail: 'Character' }),
      expect.objectContaining({
        label: '@小橘',
        apply: '@小橘',
        detail: 'characters/小橘.md',
      }),
    ]);
  });

  it('maps resource embed candidates to portable syntax and reports local diagnostics', async () => {
    const fixture = createFixture('图：![[cover');
    fixture.searchReferences.mockImplementation(async (request) => ({
      status: 'ready',
      projection: {
        ...readyProjection(request),
        candidates: [
          {
            kind: 'resource',
            source: 'asset',
            ref: { kind: 'asset', id: 'cover-1' },
            label: '封面',
            target: 'assets/cover.png',
            embeddable: true,
          },
        ],
        diagnostics: [
          {
            code: 'text-editor-markdown-reference-contributor-failed',
            source: 'entity',
          },
        ],
      },
    }));

    const completion = await fixture.complete(fixture.projection.source.length);

    expect(completion).toMatchObject({ from: 2, to: fixture.projection.source.length });
    expect(completion?.options).toEqual([
      expect.objectContaining({ label: '封面', apply: '![[assets/cover.png]]' }),
    ]);
    expect(fixture.reportDiagnostics).toHaveBeenCalledWith({
      catalog: [
        {
          code: 'text-editor-markdown-reference-contributor-failed',
          source: 'entity',
        },
      ],
      markdown: [],
    });
  });

  it('suppresses completion during IME and before accepted source catches up', async () => {
    const fixture = createFixture('@小');
    fixture.composing = true;
    await expect(fixture.complete(2)).resolves.toBeNull();
    fixture.composing = false;
    fixture.projection = { ...fixture.projection, source: '@旧' };
    await expect(fixture.complete(2)).resolves.toBeNull();
    expect(fixture.searchReferences).not.toHaveBeenCalled();
  });

  it('rejects a mismatched Host projection instead of consuming stale candidates', async () => {
    const fixture = createFixture('@小');
    fixture.searchReferences.mockImplementation(async (request) => ({
      status: 'ready',
      projection: { ...readyProjection(request), query: 'other' },
    }));

    await expect(fixture.complete(2)).rejects.toThrow(
      'Text Editor Markdown reference search projection is stale or mismatched.',
    );
  });

  it('discards an explicitly cancelled Host search result', async () => {
    const fixture = createFixture('@小');
    fixture.searchReferences.mockResolvedValue({ status: 'discarded', reason: 'cancelled' });
    await expect(fixture.complete(2)).resolves.toBeNull();
  });
});

function createFixture(source: string) {
  const fixture: {
    projection: TextDocumentProjection;
    composing: boolean;
    requestSequence: number;
    searchReferences: ReturnType<
      typeof vi.fn<
        (
          request: TextEditorMarkdownReferenceSearchRequest,
          signal: AbortSignal,
        ) => Promise<TextEditorMarkdownReferenceSearchResult>
      >
    >;
    reportDiagnostics: ReturnType<
      typeof vi.fn<MarkdownCompletionSourceOptions['reportDiagnostics']>
    >;
    complete(
      position: number,
      explicit?: boolean,
    ): Promise<Awaited<ReturnType<ReturnType<typeof createMarkdownCompletionSource>>>>;
  } = {
    projection: markdownProjection(source),
    composing: false,
    requestSequence: 0,
    searchReferences: vi.fn(async (request) => ready(request, [])),
    reportDiagnostics: vi.fn(),
    complete: async () => null,
  };
  const sourceFunction = createMarkdownCompletionSource({
    readProjection: () => fixture.projection,
    nextRequestId: () => `completion-request-${++fixture.requestSequence}`,
    isComposing: () => fixture.composing,
    searchReferences: fixture.searchReferences,
    reportDiagnostics: fixture.reportDiagnostics,
  });
  fixture.complete = (position, explicit = false) =>
    sourceFunction(new CompletionContext(EditorState.create({ doc: source }), position, explicit));
  return fixture;
}

function markdownProjection(source: string): TextDocumentProjection {
  return {
    identity: {
      owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
      workspaceId: 'workspace-1',
      documentId: 'notes/draft.md',
      locator: { kind: 'workspace-file', path: 'notes/draft.md' },
    },
    sessionId: 'session-1',
    editSequence: 2,
    mode: 'markdown',
    source,
    dirty: true,
    conflict: false,
    diagnostics: [],
  };
}

function ready(
  request: TextEditorMarkdownReferenceSearchRequest,
  candidates: TextEditorMarkdownReferenceSearchProjection['candidates'],
): TextEditorMarkdownReferenceSearchResult {
  return {
    status: 'ready',
    projection: { ...readyProjection(request), candidates },
  };
}

function readyProjection(
  request: TextEditorMarkdownReferenceSearchRequest,
): TextEditorMarkdownReferenceSearchProjection {
  return {
    requestId: request.requestId,
    identity: request.identity,
    sessionId: request.sessionId,
    editSequence: request.editSequence,
    kind: request.kind,
    query: request.query,
    candidates: [],
    diagnostics: [],
  };
}
