import { describe, expect, it } from 'vitest';
import type { DocumentArchiveResourceRef } from '@neko/shared';
import { buildNekoSuitePluginTransferPlan } from '..';

describe('neko-suite plugin transfer planner', () => {
  it('builds domain command plans outside Agent runtime', () => {
    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'canvas',
        assetPath: '/tmp/image.png',
        mediaType: 'image',
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.canvas.importAsset',
      payload: { path: '/tmp/image.png', type: 'image' },
    });

    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'cut',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/sound.wav', mediaType: 'audio' },
          target: {
            kind: 'file',
            documentUri: 'file:///project/edit.nkv',
            expectedProjectRevision: 'revision-1',
          },
        },
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.cut.authoring.importGeneratedClip',
      payload: {
        assetPath: '/tmp/sound.wav',
        mediaType: 'audio',
        target: { kind: 'file', documentUri: 'file:///project/edit.nkv' },
        expectedProjectRevision: 'revision-1',
      },
    });

    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'sketch',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/frame.png', mediaType: 'image', name: 'Frame' },
        },
      }),
    ).toEqual({
      status: 'unsupported',
      target: 'sketch',
    });

    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'model',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/character.glb', mediaType: 'model', name: 'Character' },
        },
      }),
    ).toEqual({
      status: 'unsupported',
      target: 'model',
    });

    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'explorer',
        assetPath: '/tmp/frame.png',
        mediaType: 'image',
      }),
    ).toEqual({
      status: 'reveal-file',
      filePath: '/tmp/frame.png',
    });
  });

  it('builds structured cut storyboard transfer plans', () => {
    const storyboard = {
      projectName: 'Opening',
      shots: [
        {
          id: 'shot-1',
          shotNumber: 1,
          duration: 3,
          imagePath: '/repo/shot-1.png',
          label: '#001',
        },
      ],
    };

    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'cut',
        payload: {
          kind: 'cutStoryboard',
          storyboard,
          target: { kind: 'new', documentUri: 'file:///project/opening.nkv' },
        },
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.cut.authoring.importStoryboard',
      payload: {
        ...storyboard,
        target: { kind: 'new', documentUri: 'file:///project/opening.nkv' },
      },
    });

    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'canvas',
        payload: { kind: 'cutStoryboard', storyboard },
      }),
    ).toEqual({
      status: 'unsupported',
      target: 'canvas',
      reason: 'unsupported-structured-target',
    });
  });

  it('fails closed when a Cut transfer omits an explicit file or new target', () => {
    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'cut',
        assetPath: '/tmp/shot.mp4',
        mediaType: 'video',
      }),
    ).toEqual({
      status: 'unsupported',
      target: 'cut',
      reason: 'explicit-cut-target-required',
    });

    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'cut',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/shot.mp4', mediaType: 'video' },
          target: { kind: 'file', documentUri: 'file:///project/edit.nkv' },
        },
      }),
    ).toEqual({
      status: 'unsupported',
      target: 'cut',
      reason: 'cut-project-revision-required',
    });
  });

  it('preserves Canvas resource metadata and allows linked resources without cache paths', () => {
    const documentResourceRef: DocumentArchiveResourceRef = {
      kind: 'document-entry',
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
      entryPath: 'image/page-1.jpg',
      versionPolicy: 'versioned-export',
    };

    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'canvas',
        payload: {
          kind: 'singleAsset',
          asset: {
            mediaType: 'image',
            name: 'page-1.jpg',
            documentResourceRef,
          },
          target: { containerId: 'scene-1', mode: 'create-child' },
          provenance: {
            source: 'agent',
            toolCallId: 'tool-1',
            metadata: { documentResourceRef },
          },
        },
      }),
    ).toEqual({
      status: 'execute-command',
      command: 'neko.canvas.importAsset',
      payload: {
        type: 'image',
        name: 'page-1.jpg',
        documentResourceRef,
        target: { containerId: 'scene-1', mode: 'create-child' },
        provenance: {
          source: 'agent',
          toolCallId: 'tool-1',
          metadata: { documentResourceRef },
        },
      },
    });
  });

  it('rejects removed durable authoring targets', () => {
    expect(
      buildNekoSuitePluginTransferPlan({
        target: 'sketch',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/frame.png', mediaType: 'image', name: 'Frame' },
        },
      }),
    ).toEqual({
      status: 'unsupported',
      target: 'sketch',
    });
  });

  it('does not emit legacy UI-bound durable command ids', () => {
    const plans = [
      buildNekoSuitePluginTransferPlan({
        target: 'cut',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/shot.mp4', mediaType: 'video' },
          target: {
            kind: 'file',
            documentUri: 'file:///project/edit.nkv',
            expectedProjectRevision: 'revision-1',
          },
        },
      }),
      buildNekoSuitePluginTransferPlan({
        target: 'sketch',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/frame.png', mediaType: 'image' },
        },
      }),
      buildNekoSuitePluginTransferPlan({
        target: 'model',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/tmp/character.glb', mediaType: 'model' },
        },
      }),
    ];

    expect(plans).toEqual([
      expect.objectContaining({ command: 'neko.cut.authoring.importGeneratedClip' }),
      { status: 'unsupported', target: 'sketch' },
      { status: 'unsupported', target: 'model' },
    ]);
    expect(
      plans.map((plan) => (plan.status === 'execute-command' ? plan.command : '')),
    ).not.toEqual(expect.arrayContaining(['neko.cut.importGeneratedClip']));
  });

  it.each([
    ['canvasStoryboard', { kind: 'canvasStoryboard', storyboard: {} }],
    ['canvasPrompt', { kind: 'canvasPrompt', prompt: 'legacy prompt' }],
    ['canvasText', { kind: 'canvasText', text: '| visual |\\n| --- |\\n| open |' }],
    ['canvasStructuredContent', { kind: 'canvasStructuredContent', content: { beats: ['open'] } }],
    [
      'canvasAuthoringHandoff',
      { kind: 'canvasAuthoringHandoff', content: '{"kind":"storyboard-draft"}' },
    ],
  ])('fails visibly for unsupported Canvas authoring payload kind %s', (kind, payload) => {
    expect(() =>
      buildNekoSuitePluginTransferPlan({
        target: 'canvas',
        payload: payload as never,
      }),
    ).toThrow(`Unsupported plugin transfer payload kind: ${kind}`);
  });

  it('fails visibly for unsupported direct payload kinds', () => {
    expect(() =>
      buildNekoSuitePluginTransferPlan({
        target: 'cut',
        payload: {
          kind: 'assetBatch',
          assets: [{ path: '/tmp/a.png', mediaType: 'image' }],
        } as never,
      }),
    ).toThrow('Unsupported plugin transfer payload kind: assetBatch');
  });
});
