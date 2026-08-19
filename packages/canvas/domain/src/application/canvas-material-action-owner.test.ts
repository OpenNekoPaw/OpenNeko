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
  CANVAS_ADD_TO_CUT_ACTION_ID,
  CANVAS_EDIT_TEXT_ACTION_ID,
  CANVAS_OPEN_IN_CUT_ACTION_ID,
  CANVAS_PREVIEW_ACTION_ID,
  CANVAS_REGENERATE_ACTION_ID,
  CANVAS_REVEAL_ACTION_ID,
  CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID,
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
  locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
};

const generatedTarget: CanvasMaterialActionTarget = {
  nodeId: 'generated-media-1',
  mediaKind: 'image',
  origin: 'generated',
  locator: { file: { authority: 'workspace', path: 'neko/generated/generation-job-1/result.png' } },
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

  it('omits Reveal when the Desktop owner cannot resolve an independent Host file', async () => {
    const embeddedTarget: CanvasMaterialActionTarget = {
      nodeId: 'embedded-image-1',
      mediaKind: 'image',
      origin: 'referenced',
      locator: {
        file: { authority: 'workspace', path: 'books/story.epub' },
        selector: { kind: 'entry', path: 'OPS/images/cover.jpg' },
      },
    };
    const resolveReveal = vi.fn(async () => false);
    const reveal = vi.fn(async () => undefined);
    const owner = createCanvasMaterialActionOwner({ resolveReveal, reveal });

    await expect(owner.resolve({ identity, targets: [embeddedTarget] })).resolves.toEqual([]);
    expect(resolveReveal).toHaveBeenCalledWith({ identity, target: embeddedTarget });
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
      locator: { file: { authority: 'workspace', path: 'edits/sequence.otio' } },
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

  it('does not probe the referenced-document Cut owner for generated Image material', async () => {
    const resolveCut = vi.fn(async () => {
      throw new Error('Image material must not enter Cut document resolution.');
    });
    const owner = createCanvasMaterialActionOwner({
      preview: async () => undefined,
      resolveCut,
      openInCut: async () => undefined,
    });

    await expect(owner.resolve({ identity, targets: [generatedTarget] })).resolves.toEqual([
      expect.objectContaining({ id: CANVAS_PREVIEW_ACTION_ID, ownerId: 'preview' }),
    ]);
    expect(resolveCut).not.toHaveBeenCalled();
  });

  it('contributes Text Editor only for an admitted referenced document target', async () => {
    const textTarget: CanvasMaterialActionTarget = {
      nodeId: 'notes-1',
      mediaKind: 'document',
      origin: 'referenced',
      locator: { file: { authority: 'workspace', path: 'notes/scene.md' } },
    };
    const generatedTextTarget: CanvasMaterialActionTarget = {
      nodeId: 'prompt-output-1',
      mediaKind: 'document',
      origin: 'generated',
      locator: { file: { authority: 'workspace', path: 'neko/generated/prompt-output-1.txt' } },
    };
    const resolveEditText = vi.fn(async () => true);
    const editText = vi.fn(async () => undefined);
    const owner = createCanvasMaterialActionOwner({ resolveEditText, editText });

    const descriptors = await owner.resolve({ identity, targets: [textTarget] });
    await expect(owner.resolve({ identity, targets: [generatedTextTarget] })).resolves.toEqual([]);

    expect(descriptors.map((descriptor) => descriptor.id)).toEqual([CANVAS_EDIT_TEXT_ACTION_ID]);
    expect(resolveEditText).toHaveBeenCalledTimes(1);
    const descriptor = descriptors[0];
    if (!descriptor) throw new Error('Text Editor descriptor is missing.');
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
        selectedNodeIds: [textTarget.nodeId],
        payload: {},
      },
      targets: [textTarget],
    });
    expect(editText).toHaveBeenCalledWith({ identity, target: textTarget });
  });

  it('contributes Add to Cut only for audio/video and preserves the exact owner payload', async () => {
    const videoTarget: CanvasMaterialActionTarget = {
      nodeId: 'video-1',
      mediaKind: 'video',
      origin: 'referenced',
      locator: { file: { authority: 'workspace', path: 'media/clip.mp4' } },
    };
    const executionPayload = {
      target: {
        kind: 'existing',
        viewId: 'cut-view-1',
        documentId: 'edits/sequence.otio',
      },
    } as const;
    const resolveAddToCut = vi.fn(async () => executionPayload);
    const addToCut = vi.fn(async () => undefined);
    const owner = createCanvasMaterialActionOwner({ resolveAddToCut, addToCut });

    const descriptors = await owner.resolve({ identity, targets: [videoTarget] });
    expect(descriptors).toEqual([
      expect.objectContaining({
        id: CANVAS_ADD_TO_CUT_ACTION_ID,
        label: 'Add to Cut',
        mediaKinds: ['video', 'audio'],
        executionPayload,
      }),
    ]);
    const descriptor = descriptors[0];
    if (!descriptor) throw new Error('Add to Cut descriptor is missing.');
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
        selectedNodeIds: [videoTarget.nodeId],
        payload: executionPayload,
      },
      targets: [videoTarget],
    });

    expect(addToCut).toHaveBeenCalledWith({ identity, target: videoTarget, executionPayload });
    await expect(owner.resolve({ identity, targets: [target] })).resolves.toEqual([]);
  });

  it('contributes and dispatches Cut-owned Video audio separation with the exact target payload', async () => {
    const videoTarget: CanvasMaterialActionTarget = {
      nodeId: 'video-1',
      mediaKind: 'video',
      origin: 'generated',
      locator: { file: { authority: 'workspace', path: 'neko/generated/video-output-1.mp4' } },
    };
    const executionPayload = {
      target: {
        kind: 'existing-cut',
        viewId: 'cut-view-1',
        documentId: 'edits/sequence.otio',
      },
    } as const;
    const separateAudioInCut = vi.fn(async () => undefined);
    const owner = createCanvasMaterialActionOwner({
      resolveAddToCut: async () => executionPayload,
      addToCut: async () => undefined,
      separateAudioInCut,
    });

    const descriptors = await owner.resolve({ identity, targets: [videoTarget] });
    const descriptor = descriptors.find(
      (candidate) => candidate.id === CANVAS_VIDEO_SEPARATE_AUDIO_ACTION_ID,
    );
    if (!descriptor) throw new Error('Video audio-separation descriptor is missing.');

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
        selectedNodeIds: [videoTarget.nodeId],
        payload: executionPayload,
      },
      targets: [videoTarget],
    });

    expect(separateAudioInCut).toHaveBeenCalledWith({
      identity,
      target: videoTarget,
      executionPayload,
    });
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
