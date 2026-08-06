import type {
  CanvasGenerationProjectionSnapshot,
  CanvasHostRuntimeIdentity,
  CanvasMaterialActionTarget,
} from '@neko/canvas-domain';
import { describe, expect, it, vi } from 'vitest';
import {
  createCanvasMaterialActionOwner,
  CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
  CANVAS_OPEN_IN_CUT_ACTION_ID,
  CANVAS_PREVIEW_ACTION_ID,
  CANVAS_REGENERATE_ACTION_ID,
  CANVAS_REVEAL_ACTION_ID,
} from './canvas-material-action-owner';

const identity: CanvasHostRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas:view-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'neko/boards/workspace.nkc',
  sessionId: 'canvas-session:canvas:view-1:view-instance-1',
  rendererSessionId: 'app-1:window-1:1',
};

const target: CanvasMaterialActionTarget = {
  nodeId: 'media-1',
  mediaKind: 'image',
  origin: 'referenced',
  locator: { kind: 'workspace-file', path: 'media/cat.png' },
};

const generatedTarget: CanvasMaterialActionTarget = {
  nodeId: 'generated-media-1',
  mediaKind: 'image',
  origin: 'generated',
  locator: {
    kind: 'generated-output',
    outputId: 'generated-output-1',
    digest: 'sha256:generated-output-1',
    path: 'neko/generated/generation-job-1/result.png',
  },
  generation: {
    jobRef: { kind: 'generation', jobId: 'generation-job-1' },
    summary: {
      prompt: 'Cold industrial corridor',
      model: 'image-model',
    },
  },
};

describe('Desktop Canvas material action owner', () => {
  it('contributes only available owners and routes their exact descriptor ids', async () => {
    const preview = vi.fn(async () => undefined);
    const reveal = vi.fn(async () => undefined);
    const owner = createCanvasMaterialActionOwner({ preview, reveal });
    const descriptors = await owner.resolve({ identity, targets: [target] });

    expect(descriptors.map((descriptor) => descriptor.id)).toEqual([
      CANVAS_PREVIEW_ACTION_ID,
      CANVAS_REVEAL_ACTION_ID,
    ]);

    const descriptor = descriptors[0];
    if (!descriptor) throw new Error('Preview descriptor is missing.');
    await owner.execute({
      identity,
      descriptor,
      action: {
        identity: {
          projectId: identity.projectId,
          canvasId: identity.documentId,
          canvasSessionId: identity.sessionId,
        },
        actionId: descriptor.id,
        selectedNodeIds: [target.nodeId],
        payload: {},
      },
      targets: [target],
    });

    expect(preview).toHaveBeenCalledWith({ identity, target });
    expect(reveal).not.toHaveBeenCalled();
  });

  it('omits unavailable owners and rejects unknown action dispatch', async () => {
    const preview = vi.fn(async () => undefined);
    const owner = createCanvasMaterialActionOwner({ preview });
    const descriptors = await owner.resolve({ identity, targets: [target] });
    const descriptor = descriptors[0];
    if (!descriptor) throw new Error('Preview descriptor is missing.');

    expect(descriptors.map((candidate) => candidate.id)).toEqual([CANVAS_PREVIEW_ACTION_ID]);
    await expect(
      owner.execute({
        identity,
        descriptor,
        action: {
          identity: {
            projectId: identity.projectId,
            canvasId: identity.documentId,
            canvasSessionId: identity.sessionId,
          },
          actionId: 'cut:add',
          selectedNodeIds: [target.nodeId],
          payload: {},
        },
        targets: [target],
      }),
    ).rejects.toThrow('descriptor does not match');
    expect(preview).not.toHaveBeenCalled();
  });

  it('contributes Generation result actions only when the canonical job is resolvable', async () => {
    const resolveGeneration = vi.fn(async () => ({
      regenerate: true,
      editAndGenerate: false,
    }));
    const regenerate = vi.fn(async () => generationProjection('generation-job-2'));
    const editAndGenerate = vi.fn(async () => generationProjection('generation-job-3'));
    const owner = createCanvasMaterialActionOwner({
      resolveGeneration,
      regenerate,
      editAndGenerate,
    });

    const descriptors = await owner.resolve({ identity, targets: [generatedTarget] });

    expect(resolveGeneration).toHaveBeenCalledWith({ identity, target: generatedTarget });
    expect(descriptors.map((descriptor) => descriptor.id)).toEqual([CANVAS_REGENERATE_ACTION_ID]);
    expect(editAndGenerate).not.toHaveBeenCalled();
  });

  it('routes Generation execution through the owner and returns its new Job projection', async () => {
    const projection = generationProjection('generation-job-2');
    const regenerate = vi.fn(async () => projection);
    const owner = createCanvasMaterialActionOwner({
      resolveGeneration: async () => ({ regenerate: true, editAndGenerate: true }),
      regenerate,
      editAndGenerate: async () => undefined,
    });
    const descriptors = await owner.resolve({ identity, targets: [generatedTarget] });
    const descriptor = descriptors.find(
      (candidate) => candidate.id === CANVAS_REGENERATE_ACTION_ID,
    );
    if (!descriptor) throw new Error('Regenerate descriptor is missing.');

    await expect(
      owner.execute({
        identity,
        descriptor,
        action: {
          identity: {
            projectId: identity.projectId,
            canvasId: identity.documentId,
            canvasSessionId: identity.sessionId,
          },
          actionId: descriptor.id,
          selectedNodeIds: [generatedTarget.nodeId],
          payload: {},
        },
        targets: [generatedTarget],
      }),
    ).resolves.toEqual({ generationProjection: projection });
    expect(regenerate).toHaveBeenCalledWith({ identity, target: generatedTarget });
  });

  it('does not derive Generation authority from generated origin without evidence', async () => {
    const resolveGeneration = vi.fn(async () => ({
      regenerate: true,
      editAndGenerate: true,
    }));
    const owner = createCanvasMaterialActionOwner({
      resolveGeneration,
      regenerate: async () => generationProjection('generation-job-2'),
      editAndGenerate: async () => generationProjection('generation-job-3'),
    });
    const targetWithoutJob: CanvasMaterialActionTarget = {
      nodeId: generatedTarget.nodeId,
      mediaKind: generatedTarget.mediaKind,
      origin: generatedTarget.origin,
      locator: generatedTarget.locator,
    };

    await expect(owner.resolve({ identity, targets: [targetWithoutJob] })).resolves.toEqual([]);
    expect(resolveGeneration).not.toHaveBeenCalled();
  });

  it('contributes and dispatches Cut only when its owner accepts the selected material', async () => {
    const cutTarget: CanvasMaterialActionTarget = {
      nodeId: 'timeline-1',
      mediaKind: 'document',
      origin: 'referenced',
      locator: { kind: 'workspace-file', path: 'edits/sequence.otio' },
    };
    const resolveCut = vi.fn(async () => true);
    const openInCut = vi.fn(async () => undefined);
    const owner = createCanvasMaterialActionOwner({ resolveCut, openInCut });
    const descriptors = await owner.resolve({ identity, targets: [cutTarget] });
    const descriptor = descriptors[0];
    if (!descriptor) throw new Error('Cut descriptor is missing.');

    expect(descriptor.id).toBe(CANVAS_OPEN_IN_CUT_ACTION_ID);
    await owner.execute({
      identity,
      descriptor,
      action: {
        identity: {
          projectId: identity.projectId,
          canvasId: identity.documentId,
          canvasSessionId: identity.sessionId,
        },
        actionId: descriptor.id,
        selectedNodeIds: [cutTarget.nodeId],
        payload: {},
      },
      targets: [cutTarget],
    });
    expect(resolveCut).toHaveBeenCalledWith({ identity, target: cutTarget });
    expect(openInCut).toHaveBeenCalledWith({ identity, target: cutTarget });
  });

  it('exposes explicit project/global Media Library copies and never an Asset promotion action', async () => {
    const copyToProjectMediaLibrary = vi.fn(async () => undefined);
    const copyToGlobalMediaLibrary = vi.fn(async () => undefined);
    const owner = createCanvasMaterialActionOwner({
      resolveMediaLibraryCopy: async () => ({ projectLinked: true, global: true }),
      copyToProjectMediaLibrary,
      copyToGlobalMediaLibrary,
    });

    const descriptors = await owner.resolve({ identity, targets: [target] });

    expect(descriptors.map((descriptor) => descriptor.id)).toEqual([
      CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
      CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID,
    ]);
    expect(descriptors).not.toContainEqual(
      expect.objectContaining({ id: 'saveCanvasMaterialToAssetLibrary' }),
    );
    const projectDescriptor = descriptors[0];
    if (!projectDescriptor) throw new Error('Project Media Library descriptor is missing.');
    await owner.execute({
      identity,
      descriptor: projectDescriptor,
      action: {
        identity: {
          projectId: identity.projectId,
          canvasId: identity.documentId,
          canvasSessionId: identity.sessionId,
        },
        actionId: projectDescriptor.id,
        selectedNodeIds: [target.nodeId],
        payload: {},
      },
      targets: [target],
    });

    expect(copyToProjectMediaLibrary).toHaveBeenCalledWith({ identity, target });
    expect(copyToGlobalMediaLibrary).not.toHaveBeenCalled();
  });
});

function generationProjection(jobId: string): CanvasGenerationProjectionSnapshot {
  return {
    ref: { kind: 'generation', jobId },
    regenerateOf: { kind: 'generation', jobId: 'generation-job-1' },
    phase: 'running',
    title: 'Regenerate image',
    inputNodeIds: [generatedTarget.nodeId],
    mediaKind: 'image',
    summary: {
      prompt: 'Cold industrial corridor',
      model: 'image-model',
    },
  };
}
