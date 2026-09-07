import { describe, expect, it } from 'vitest';
import {
  TEXT_EDITOR_HOST_ROUTES,
  parseTextEditorClipboardCommandRequest,
  parseTextEditorClipboardCommandResult,
  parseTextEditorHostRequest,
  parseTextEditorHostResult,
  parseTextEditorProjectionEvent,
  sameTextEditorRuntimeOwner,
} from './desktop-bridge';

const runtimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'text-editor-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'notes/readme.md',
  sessionId: 'text-document-1',
  rendererSessionId: 'renderer-1',
};

describe('Text Editor Desktop bridge', () => {
  it('decodes only exact owner-bound clipboard commands and results', () => {
    expect(
      parseTextEditorClipboardCommandRequest({ identity: runtimeIdentity, command: 'copy' }),
    ).toEqual({ identity: runtimeIdentity, command: 'copy' });
    expect(
      parseTextEditorClipboardCommandResult({
        identity: runtimeIdentity,
        command: 'paste',
        status: 'executed',
      }),
    ).toEqual({ identity: runtimeIdentity, command: 'paste', status: 'executed' });

    expect(() =>
      parseTextEditorClipboardCommandRequest({
        identity: runtimeIdentity,
        command: 'delete',
      }),
    ).toThrow('clipboard command is invalid');
    expect(() =>
      parseTextEditorClipboardCommandRequest({
        identity: runtimeIdentity,
        command: 'copy',
        rawPath: '/Users/private/readme.md',
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseTextEditorClipboardCommandResult({
        identity: runtimeIdentity,
        command: 'copy',
        status: 'ignored',
      }),
    ).toThrow('result status is invalid');
  });

  it('decodes exact sequenced edits without a raw path', () => {
    expect(
      parseTextEditorHostRequest({
        route: TEXT_EDITOR_HOST_ROUTES.editsApply,
        requestId: 'request-1',
        identity: runtimeIdentity,
        expectedEditSequence: 2,
        changes: [{ from: 0, to: 1, insert: 'A' }],
      }),
    ).toMatchObject({ expectedEditSequence: 2, changes: [{ from: 0, to: 1, insert: 'A' }] });
  });

  it('decodes one exact Workspace-qualified reference search route and projection', () => {
    const search = markdownReferenceSearch();
    expect(
      parseTextEditorHostRequest({
        route: TEXT_EDITOR_HOST_ROUTES.referencesSearch,
        requestId: search.requestId,
        identity: runtimeIdentity,
        search,
      }),
    ).toEqual({
      route: TEXT_EDITOR_HOST_ROUTES.referencesSearch,
      requestId: search.requestId,
      identity: runtimeIdentity,
      search,
    });
    expect(
      parseTextEditorHostResult({
        requestId: search.requestId,
        identity: runtimeIdentity,
        status: 'references-ready',
        projection: {
          ...markdownReferenceProjection(search),
          candidates: [
            {
              kind: 'resource',
              source: 'workspace-file',
              ref: { kind: 'workspace-file', id: 'assets/cover.png' },
              label: 'cover.png',
              target: 'assets/cover.png',
              embeddable: true,
            },
          ],
          diagnostics: [],
        },
      }),
    ).toMatchObject({ status: 'references-ready', projection: { requestId: search.requestId } });
  });

  it('poisons reference searches that cross document ownership or expose raw paths', () => {
    const search = markdownReferenceSearch();
    expect(() =>
      parseTextEditorHostRequest({
        route: TEXT_EDITOR_HOST_ROUTES.referencesSearch,
        requestId: search.requestId,
        identity: runtimeIdentity,
        search: {
          ...search,
          identity: {
            ...search.identity,
            documentId: 'notes/other.md',
            locator: { file: { authority: 'workspace', path: 'notes/other.md' } },
          },
        },
      }),
    ).toThrow('owner identity does not match');
    expect(() =>
      parseTextEditorHostResult({
        requestId: search.requestId,
        identity: runtimeIdentity,
        status: 'references-ready',
        projection: {
          ...markdownReferenceProjection(search),
          candidates: [
            {
              kind: 'resource',
              source: 'asset',
              ref: { kind: 'asset', id: 'asset-1' },
              label: 'Private',
              target: 'file:///Users/private/cover.png',
              embeddable: true,
            },
          ],
          diagnostics: [],
        },
      }),
    ).toThrow('candidate is invalid');
  });

  it('decodes exact Markdown media preparation and opaque projection results', () => {
    const media = markdownMediaRequest();
    expect(
      parseTextEditorHostRequest({
        route: TEXT_EDITOR_HOST_ROUTES.mediaPrepare,
        requestId: media.requestId,
        identity: runtimeIdentity,
        media,
      }),
    ).toEqual({
      route: TEXT_EDITOR_HOST_ROUTES.mediaPrepare,
      requestId: media.requestId,
      identity: runtimeIdentity,
      media,
    });
    expect(
      parseTextEditorHostResult({
        requestId: media.requestId,
        identity: runtimeIdentity,
        status: 'media-ready',
        projection: {
          ...media,
          status: 'ready',
          descriptor: {
            leaseId: 'lease-1',
            kind: 'image',
            renderUri: `openneko://resource/${'a'.repeat(32)}`,
            contentType: 'image/png',
            displayName: 'cover.png',
          },
        },
      }),
    ).toMatchObject({ status: 'media-ready', projection: { requestId: media.requestId } });
  });

  it('poisons forbidden media targets and cross-document release requests', () => {
    const media = markdownMediaRequest();
    expect(() =>
      parseTextEditorHostRequest({
        route: TEXT_EDITOR_HOST_ROUTES.mediaPrepare,
        requestId: media.requestId,
        identity: runtimeIdentity,
        media: { ...media, token: { ...media.token, target: 'file:///tmp/cover.png' } },
      }),
    ).toThrow('must be normalized and Workspace-relative');
    expect(() =>
      parseTextEditorHostRequest({
        route: TEXT_EDITOR_HOST_ROUTES.mediaRelease,
        requestId: 'release-1',
        identity: runtimeIdentity,
        media: {
          requestId: 'release-1',
          identity: {
            ...media.identity,
            documentId: 'notes/other.md',
            locator: { file: { authority: 'workspace', path: 'notes/other.md' } },
          },
          sessionId: media.sessionId,
          surfaceId: media.surfaceId,
          leaseId: 'lease-1',
        },
      }),
    ).toThrow('owner identity does not match');
    expect(() =>
      parseTextEditorHostRequest({
        route: TEXT_EDITOR_HOST_ROUTES.mediaPrepare,
        requestId: media.requestId,
        identity: runtimeIdentity,
        media: null,
      }),
    ).toThrow('preparation request is invalid');
  });

  it('decodes typed fail-local operation diagnostics', () => {
    expect(
      parseTextEditorHostResult({
        requestId: 'request-1',
        identity: runtimeIdentity,
        status: 'rejected',
        diagnostic: { code: 'text-document-save-conflict', severity: 'error' },
      }),
    ).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'text-document-save-conflict', severity: 'error' },
    });
    expect(() =>
      parseTextEditorHostResult({
        requestId: 'request-1',
        identity: runtimeIdentity,
        status: 'rejected',
        diagnostic: { code: 'unknown-text-error', severity: 'error' },
      }),
    ).toThrow('rejection diagnostic is invalid');
  });

  it('rejects unknown fields and malformed identities locally', () => {
    expect(() =>
      parseTextEditorHostRequest({
        route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
        requestId: 'request-1',
        identity: runtimeIdentity,
        rawPath: '/Users/private/readme.md',
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseTextEditorHostRequest({
        route: TEXT_EDITOR_HOST_ROUTES.projectionGet,
        requestId: 'request-1',
        identity: { ...runtimeIdentity, windowId: 'wrong/window' },
      }),
    ).toThrow('Window identity is invalid');
  });

  it('admits only a session replacement under the same exact runtime owner', () => {
    expect(
      sameTextEditorRuntimeOwner(runtimeIdentity, {
        ...runtimeIdentity,
        sessionId: 'text-document-2',
      }),
    ).toBe(true);
    expect(
      sameTextEditorRuntimeOwner(runtimeIdentity, {
        ...runtimeIdentity,
        sessionId: 'text-document-2',
        documentId: 'notes/other.md',
      }),
    ).toBe(false);
  });

  it('rejects a ready result whose projection belongs to another session', () => {
    expect(() =>
      parseTextEditorHostResult({
        requestId: 'request-mismatched-projection',
        identity: runtimeIdentity,
        status: 'ready',
        projection: {
          identity: {
            owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
            workspaceId: 'workspace-1',
            documentId: 'notes/readme.md',
            locator: { file: { authority: 'workspace', path: 'notes/readme.md' } },
          },
          sessionId: 'text-document-other',
          editSequence: 0,
          mode: 'markdown',
          source: '# Other\n',
          dirty: false,
          conflict: false,
          diagnostics: [],
        },
      }),
    ).toThrow('Host result owner identity does not match');
  });

  it('validates canonical Fountain projections from their source', () => {
    expect(() =>
      parseTextEditorHostResult({
        requestId: 'request-1',
        identity: runtimeIdentity,
        status: 'ready',
        projection: {
          identity: {
            owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
            workspaceId: 'workspace-1',
            documentId: 'story/main.fountain',
            locator: { file: { authority: 'workspace', path: 'story/main.fountain' } },
          },
          sessionId: 'text-document-1',
          editSequence: 0,
          mode: 'fountain',
          source: '.内景 房间 - 夜',
          dirty: false,
          conflict: false,
          diagnostics: [],
          screenplay: { sourceId: 'story/main.fountain', source: 'tampered' },
        },
      }),
    ).toThrow('does not match its canonical source');
  });

  it('rejects an Agent-owned document projection at the Desktop bridge', () => {
    expect(() =>
      parseTextEditorHostResult({
        requestId: 'request-1',
        identity: runtimeIdentity,
        status: 'ready',
        projection: {
          identity: {
            owner: { kind: 'agent-conversation', conversationId: 'conversation-1' },
            workspaceId: 'workspace-1',
            documentId: 'story/main.fountain',
            locator: { file: { authority: 'workspace', path: 'story/main.fountain' } },
          },
          sessionId: 'text-document-1',
          editSequence: 0,
          mode: 'fountain',
          source: '.INT. ROOM - NIGHT',
          dirty: false,
          conflict: false,
          diagnostics: [],
        },
      }),
    ).toThrow('must be a Window');
  });

  it('decodes only owner-bound projection events', () => {
    const projection = {
      identity: {
        owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
        workspaceId: 'workspace-1',
        documentId: 'notes/readme.md',
        locator: { file: { authority: 'workspace', path: 'notes/readme.md' } },
      },
      sessionId: 'text-document-1',
      editSequence: 1,
      mode: 'markdown',
      source: '# External\n',
      dirty: false,
      conflict: false,
      diagnostics: [],
    };
    expect(
      parseTextEditorProjectionEvent({ sequence: 1, identity: runtimeIdentity, projection }),
    ).toMatchObject({ sequence: 1, projection: { source: '# External\n' } });
    expect(() =>
      parseTextEditorProjectionEvent({
        sequence: 1,
        identity: { ...runtimeIdentity, workspaceId: 'workspace-2' },
        projection,
      }),
    ).toThrow('owner identity does not match');
  });
});

function markdownReferenceSearch() {
  return {
    requestId: 'reference-request-1',
    identity: {
      owner: { kind: 'window' as const, windowId: 'window-1', projectId: 'project-1' },
      workspaceId: 'workspace-1',
      documentId: 'notes/readme.md',
      locator: { file: { authority: 'workspace' as const, path: 'notes/readme.md' } },
    },
    sessionId: 'text-document-1',
    editSequence: 2,
    kind: 'resource-embed' as const,
    query: 'cover',
    limit: 30,
  };
}

function markdownReferenceProjection(search: ReturnType<typeof markdownReferenceSearch>) {
  return {
    requestId: search.requestId,
    identity: search.identity,
    sessionId: search.sessionId,
    editSequence: search.editSequence,
    kind: search.kind,
    query: search.query,
  };
}

function markdownMediaRequest() {
  return {
    requestId: 'media-request-1',
    identity: {
      owner: { kind: 'window' as const, windowId: 'window-1', projectId: 'project-1' },
      workspaceId: 'workspace-1',
      documentId: 'notes/readme.md',
      locator: { file: { authority: 'workspace' as const, path: 'notes/readme.md' } },
    },
    sessionId: 'text-document-1',
    editSequence: 2,
    surfaceId: 'surface-1',
    token: {
      kind: 'resource-embed' as const,
      from: 0,
      to: 21,
      target: 'assets/cover.png',
      altText: '封面',
    },
  };
}
