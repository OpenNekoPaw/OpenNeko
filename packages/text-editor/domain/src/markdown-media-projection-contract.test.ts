import { describe, expect, it } from 'vitest';
import {
  assertPrepareTextEditorMarkdownMediaRequest,
  assertReleaseTextEditorMarkdownMediaRequest,
  assertTextEditorMarkdownMediaProjection,
  TextEditorMarkdownMediaContractError,
  type PrepareTextEditorMarkdownMediaRequest,
} from './markdown-media-projection-contract';

const request: PrepareTextEditorMarkdownMediaRequest = {
  requestId: 'media-request-1',
  identity: {
    owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
    workspaceId: 'workspace-1',
    documentId: 'notes/draft.md',
    locator: { kind: 'workspace-file', path: 'notes/draft.md' },
  },
  sessionId: 'session-1',
  editSequence: 4,
  surfaceId: 'surface-1',
  token: {
    kind: 'resource-embed',
    from: 10,
    to: 31,
    target: 'assets/cover.png',
    altText: '封面',
  },
};

describe('Text Editor Markdown media projection contract', () => {
  it('accepts an exact Host-projected typed media descriptor', () => {
    expect(() =>
      assertTextEditorMarkdownMediaProjection(request, {
        ...request,
        status: 'ready',
        descriptor: {
          leaseId: 'lease-1',
          kind: 'image',
          renderUri: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
          contentType: 'image/png',
          displayName: 'cover.png',
          byteLength: 1024,
        },
      }),
    ).not.toThrow();
  });

  it.each([
    'file:///tmp/cover.png',
    '/Users/neko/cover.png',
    'https://example.com/cover.png',
    'assets/cover.png',
    'data:image/png;base64,AAAA',
  ])('rejects a non-Host-projected render URI: %s', (renderUri) => {
    expect(() =>
      assertTextEditorMarkdownMediaProjection(request, {
        ...request,
        status: 'ready',
        descriptor: {
          leaseId: 'lease-1',
          kind: 'image',
          renderUri,
          contentType: 'image/png',
          displayName: 'cover.png',
        },
      }),
    ).toThrow('requires a Host-projected runtime URI');
  });

  it('rejects a projection from another edit or visible surface', () => {
    expect(() =>
      assertTextEditorMarkdownMediaProjection(request, {
        ...request,
        editSequence: 5,
        surfaceId: 'surface-2',
        status: 'unavailable',
        diagnostic: { code: 'text-editor-markdown-media-stale-surface' },
      }),
    ).toThrow('does not match its request');
  });

  it('accepts fail-visible unavailable media without a descriptor fallback', () => {
    expect(() =>
      assertTextEditorMarkdownMediaProjection(request, {
        ...request,
        status: 'unavailable',
        diagnostic: { code: 'text-editor-markdown-media-unauthorized' },
      }),
    ).not.toThrow();
  });

  it('poisons mismatched document locators and empty token ranges', () => {
    expect(() =>
      assertPrepareTextEditorMarkdownMediaRequest({
        ...request,
        identity: {
          ...request.identity,
          locator: { kind: 'workspace-file', path: 'notes/other.md' },
        },
      }),
    ).toThrow('document locator does not match');
    expect(() =>
      assertPrepareTextEditorMarkdownMediaRequest({
        ...request,
        token: { ...request.token, to: request.token.from },
      }),
    ).toThrow('token range is invalid');
  });

  it.each([
    '/Users/neko/cover.png',
    'C:/Users/neko/cover.png',
    '../outside.png',
    'assets/../outside.png',
    'file:///tmp/cover.png',
    'openneko://resource/0123456789abcdefghijklmnopqrstuv',
    'http://127.0.0.1:43821/cover.png',
    'data:image/png;base64,AAAA',
    '.cache/cover.png',
  ])('rejects a forbidden persisted target before Host resolution: %s', (target) => {
    expect(() =>
      assertPrepareTextEditorMarkdownMediaRequest({
        ...request,
        token: { ...request.token, target },
      }),
    ).toThrow('must be normalized and Workspace-relative');
  });

  it('validates exact release ownership independently from preparation', () => {
    expect(() =>
      assertReleaseTextEditorMarkdownMediaRequest({
        requestId: 'release-1',
        identity: request.identity,
        sessionId: request.sessionId,
        surfaceId: request.surfaceId,
        leaseId: 'lease-1',
      }),
    ).not.toThrow();
    expect(() =>
      assertReleaseTextEditorMarkdownMediaRequest({
        requestId: 'release-1',
        identity: request.identity,
        sessionId: request.sessionId,
        surfaceId: request.surfaceId,
        leaseId: '',
      }),
    ).toThrowError(TextEditorMarkdownMediaContractError);
  });
});
