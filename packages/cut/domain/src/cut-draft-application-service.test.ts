import { describe, expect, it, vi } from 'vitest';
import {
  CutDraftApplicationService,
  createCutCanvasHandoffPayload,
  parseCutCanvasHandoffPayload,
  resolveCutCanvasHandoffTarget,
  sameCutCanvasHandoffTarget,
} from './cut-draft-application-service';

const source = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas:view-1',
  viewInstanceId: 'view-instance-1',
  rendererSessionId: 'renderer-1',
};

describe('CutDraftApplicationService', () => {
  it('owns unique labels and exact draft identities', () => {
    const service = new CutDraftApplicationService(() => 'draft-3');

    expect(
      service.planDraft({
        owner: {
          projectId: source.projectId,
          workspaceId: source.workspaceId,
          windowId: source.windowId,
          parentViewId: 'project-view-1',
          viewInstanceId: source.viewInstanceId,
          rendererSessionId: source.rendererSessionId,
          workbenchInstanceId: 'workbench-1',
        },
        existingLabels: ['Untitled Cut', 'Untitled Cut 2'],
      }),
    ).toEqual({
      workbenchInstanceId: 'workbench-1',
      label: 'Untitled Cut 3',
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'cut:project-view-1:draft-3',
        viewInstanceId: 'view-instance-1',
        documentId: 'cut-draft:draft-3',
        sessionId: 'cut-session:cut:project-view-1:draft-3:view-instance-1',
        rendererSessionId: 'renderer-1',
      },
    });
  });

  it('discards the exact session when presentation opening fails', async () => {
    const service = new CutDraftApplicationService(() => 'draft-failed');
    const createSession = vi.fn();
    const discardSession = vi.fn();
    const failure = new Error('shell update failed');

    await expect(
      service.createDraft(
        {
          owner: {
            projectId: source.projectId,
            workspaceId: source.workspaceId,
            windowId: source.windowId,
            parentViewId: 'project-view-1',
            viewInstanceId: source.viewInstanceId,
            rendererSessionId: source.rendererSessionId,
            workbenchInstanceId: 'workbench-1',
          },
          existingLabels: [],
        },
        {
          createSession,
          openPresentation: vi.fn(async () => {
            throw failure;
          }),
          discardSession,
        },
      ),
    ).rejects.toBe(failure);
    expect(createSession).toHaveBeenCalledOnce();
    expect(discardSession).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'cut-draft:draft-failed' }),
    );
  });
});

describe('Cut Canvas handoff policy', () => {
  it('selects a new draft only when no active Cut candidate exists', () => {
    expect(resolveCutCanvasHandoffTarget({ source, workbenchInstanceId: 'workbench-1' })).toEqual({
      kind: 'new-cut-draft',
      workbenchInstanceId: 'workbench-1',
    });
  });

  it('selects one exact existing Cut target', () => {
    const target = resolveCutCanvasHandoffTarget({
      source,
      workbenchInstanceId: 'workbench-1',
      activeCut: {
        kind: 'cut',
        projectId: source.projectId,
        workspaceId: source.workspaceId,
        viewId: 'cut:view-1',
        viewInstanceId: 'cut-view-instance-1',
        documentId: 'cuts/story.otio',
        ownerId: 'cut-session:cut:view-1:cut-view-instance-1',
      },
    });

    expect(target).toEqual({
      kind: 'existing-cut',
      workbenchInstanceId: 'workbench-1',
      viewId: 'cut:view-1',
      viewInstanceId: 'cut-view-instance-1',
      documentId: 'cuts/story.otio',
      sessionId: 'cut-session:cut:view-1:cut-view-instance-1',
    });
    expect(parseCutCanvasHandoffPayload(createCutCanvasHandoffPayload(target))).toEqual(target);
    expect(sameCutCanvasHandoffTarget(target, { ...target })).toBe(true);
  });

  it('rejects cross-owner and invalid-session candidates', () => {
    expect(() =>
      resolveCutCanvasHandoffTarget({
        source,
        workbenchInstanceId: 'workbench-1',
        activeCut: {
          kind: 'cut',
          projectId: 'project-other',
          workspaceId: source.workspaceId,
          viewId: 'cut:view-1',
          viewInstanceId: source.viewInstanceId,
          documentId: 'cuts/story.otio',
          ownerId: 'cut-session:cut:view-1:view-instance-1',
        },
      }),
    ).toThrow('outside the exact Workspace');

    expect(() =>
      resolveCutCanvasHandoffTarget({
        source,
        workbenchInstanceId: 'workbench-1',
        activeCut: {
          kind: 'cut',
          projectId: source.projectId,
          workspaceId: source.workspaceId,
          viewId: 'cut:view-1',
          viewInstanceId: source.viewInstanceId,
          documentId: 'cuts/story.otio',
          ownerId: 'cut-session:stale',
        },
      }),
    ).toThrow('session identity is invalid');
  });
});
