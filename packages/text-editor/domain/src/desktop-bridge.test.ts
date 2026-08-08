import { describe, expect, it } from 'vitest';
import {
  TEXT_EDITOR_HOST_ROUTES,
  parseTextEditorHostRequest,
  parseTextEditorHostResult,
  parseTextEditorProjectionEvent,
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
            locator: { kind: 'workspace-file', path: 'story/main.fountain' },
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
            locator: { kind: 'workspace-file', path: 'story/main.fountain' },
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
        locator: { kind: 'workspace-file', path: 'notes/readme.md' },
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
