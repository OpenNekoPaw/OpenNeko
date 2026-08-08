import { describe, expect, it } from 'vitest';
import {
  desktopCutIdentityKey,
  parseDesktopCutViewMutationRequest,
  rebindDesktopCutProjectionState,
  type DesktopCutViewMutationRequest,
} from './cut-bridge-contract';

describe('Desktop Cut View mutation contract', () => {
  it('accepts canonical draft creation and exact close requests', () => {
    const create: DesktopCutViewMutationRequest = {
      requestId: 'request-create',
      windowId: 'window-1',
      rendererSessionId: 'renderer-1',
      workbenchInstanceId: 'workbench-1',
    };
    const close: DesktopCutViewMutationRequest = {
      ...create,
      requestId: 'request-close',
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'cut-view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'cut-draft:draft-1',
        sessionId: 'cut-session:cut-view-1:view-instance-1',
        rendererSessionId: 'renderer-1',
      },
    };

    expect(parseDesktopCutViewMutationRequest(create)).toEqual(create);
    expect(parseDesktopCutViewMutationRequest(close)).toEqual(close);
  });

  it('rejects unknown fields and partial identities locally', () => {
    expect(() =>
      parseDesktopCutViewMutationRequest({
        requestId: 'request-create',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        workbenchInstanceId: 'workbench-1',
        fallbackDocumentId: 'recent.otio',
      }),
    ).toThrow('unknown fields');
    expect(() =>
      parseDesktopCutViewMutationRequest({
        requestId: 'request-close',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        workbenchInstanceId: 'workbench-1',
        identity: { documentId: 'cut-draft:draft-1' },
      }),
    ).toThrow();
  });

  it('moves the subscribed identity and authoritative event cursor together', () => {
    const previousIdentity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'cut-view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'cut-draft:draft-1',
      sessionId: 'cut-session:cut-view-1:view-instance-1',
      rendererSessionId: 'renderer-1',
    };
    const nextIdentity = { ...previousIdentity, documentId: 'cuts/story.otio' };
    const listener = () => undefined;
    const identities = new Map([[desktopCutIdentityKey(previousIdentity), previousIdentity]]);
    const eventSequences = new Map([[desktopCutIdentityKey(previousIdentity), 0]]);
    const listeners = new Set([{ identity: previousIdentity, listener }]);

    rebindDesktopCutProjectionState({
      identities,
      eventSequences,
      listeners,
      previousIdentity,
      nextIdentity,
      eventSequence: 1,
    });

    expect(identities.has(desktopCutIdentityKey(previousIdentity))).toBe(false);
    expect(identities.get(desktopCutIdentityKey(nextIdentity))).toEqual(nextIdentity);
    expect(eventSequences.get(desktopCutIdentityKey(nextIdentity))).toBe(1);
    expect([...listeners]).toEqual([{ identity: nextIdentity, listener }]);
  });
});
