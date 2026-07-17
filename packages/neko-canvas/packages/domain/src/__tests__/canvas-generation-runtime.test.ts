import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
} from '@neko/shared';
import {
  CanvasGenerationRuntime,
  buildCanvasMediaOutputDataUrl,
  buildCanvasImageGenerationRequest,
  buildCanvasShotPromptUserContent,
  collectCanvasGenerationReferenceDescriptors,
  convertCanvasFileUrlToPath,
  inferCanvasImageMimeType,
  normalizeCanvasControlMode,
  normalizeCanvasGenerationCount,
  parseCanvasImageDataUrl,
  planCanvasImageSource,
  resolveCanvasIpAdapterReferences,
  selectCanvasReferenceImageSource,
} from '../canvas-generation-runtime';

const OWNER_SCOPE = { conversationId: 'canvas-document-1', runId: 'generation-run-1' } as const;
const TASK_SCOPE = {
  ...OWNER_SCOPE,
  parentRunId: OWNER_SCOPE.runId,
  childRunId: 'task-1',
  childKind: 'task',
} as const;

describe('canvas generation runtime', () => {
  it('does not expose LLM or provider routing through the Canvas runtime contract', () => {
    const source = readFileSync(
      new URL('../canvas-generation-runtime.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/CanvasPromptLLM|CanvasPromptMessage|IService|\.chat\s*\(/);
    expect(source).not.toMatch(
      /providerId|modelId|credential|maxTokens|temperature|thinkingBudget|@neko\/agent\/pi/,
    );
  });

  it('builds AutoPrompt messages from shot metadata without static defaults', () => {
    const userContent = buildCanvasShotPromptUserContent({
      visualDescription: '雨夜街道里的侦探',
      characters: [{ characterName: 'Mika' }],
      shotScale: 'wide',
      cameraMovement: 'static',
      cameraAngle: 'eye-level',
      characterAction: 'walking through neon rain',
      emotion: ['tense'],
      sceneTags: ['cyberpunk'],
      dialogue: 'We are close.',
    });

    expect(userContent).toContain('Scene: 雨夜街道里的侦探');
    expect(userContent).toContain('Characters: Mika');
    expect(userContent).toContain('Action: walking through neon rain');
    expect(userContent).not.toContain('Camera: static');
    expect(userContent).not.toContain('Angle: eye-level');

    expect(buildCanvasShotPromptUserContent({})).toBe(
      'Generate an image prompt for this shot.',
    );
  });

  it('prefers semantic storyboardPrompt over legacy generationPrompt and includes style/vfx', () => {
    const userContent = buildCanvasShotPromptUserContent({
      storyboardPrompt: {
        version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
        promptBlocks: {
          imagePromptDocument: {
            version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
            documentId: 'shot-1:image:prompt',
            blockKind: 'image',
            text: '语义图片提示词，雨夜咖啡厅，霓虹倒影',
          },
        },
      },
      generationPrompt: '赛博朋克咖啡厅，霓虹雨夜',
      visualDescription: 'A coffee shop scene',
      visualStyle: 'noir',
      vfx: ['rain', 'neon glow'],
      shotScale: 'CU',
    });

    expect(userContent).toContain('Semantic prompt: 语义图片提示词，雨夜咖啡厅，霓虹倒影');
    expect(userContent).not.toContain('赛博朋克咖啡厅，霓虹雨夜');
    expect(userContent).not.toContain('A coffee shop scene');
    expect(userContent).toContain('Style: noir');
    expect(userContent).toContain('VFX: rain, neon glow');
  });

  it('treats legacy generationPrompt as migration input instead of AutoPrompt authority', () => {
    const userContent = buildCanvasShotPromptUserContent({
      generationPrompt: 'legacy prompt should not be used',
      visualDescription: 'A coffee shop scene',
      shotScale: 'CU',
    });

    expect(userContent).toContain('Scene: A coffee shop scene');
    expect(userContent).not.toContain('legacy prompt should not be used');
  });

  it('does not use legacy-only generationPrompt as AutoPrompt input', () => {
    const userContent = buildCanvasShotPromptUserContent({
      generationPrompt: 'legacy-only prompt should not generate success',
    });

    expect(userContent).toBe('Generate an image prompt for this shot.');
  });

  it('localizes AutoPrompt wrapper text while preserving English prompt output policy', () => {
    const userContent = buildCanvasShotPromptUserContent(
      {
        visualDescription: '雨夜街道里的侦探',
        characters: [{ characterName: 'Mika' }],
        shotScale: 'wide',
        characterAction: 'walking through neon rain',
      },
      { locale: 'zh-CN' },
    );

    expect(userContent).toContain('场景: 雨夜街道里的侦探');
    expect(userContent).toContain('角色: Mika');
    expect(userContent).not.toContain('Scene:');
    expect(userContent).not.toContain('Characters:');
  });

  it('delegates prompt generation through the semantic Canvas operation', async () => {
    const generate = vi.fn().mockResolvedValue('A concise cinematic English prompt.');
    const runtime = new CanvasGenerationRuntime({ promptGenerator: { generate } });
    const shotData = { visualDescription: '森林里的猫' };

    await expect(runtime.buildPrompt(shotData)).resolves.toBe(
      'A concise cinematic English prompt.',
    );
    expect(generate).toHaveBeenCalledWith(shotData);
  });

  it('plans canvas image source materialization without host IO', () => {
    expect(parseCanvasImageDataUrl('data:image/webp;base64,abc123')).toEqual({
      base64: 'abc123',
      mimeType: 'image/webp',
    });
    expect(parseCanvasImageDataUrl('data:image/png;base64,')).toEqual({
      base64: '',
      mimeType: 'image/png',
    });
    expect(parseCanvasImageDataUrl('data:image/png,abc123')).toBeUndefined();

    expect(inferCanvasImageMimeType('https://cdn.test/ref.avif?x=1')).toBe('image/avif');
    expect(inferCanvasImageMimeType('/tmp/ref.unknown')).toBe('image/png');

    expect(convertCanvasFileUrlToPath('file:///tmp/ref.png')).toBe('/tmp/ref.png');
    expect(convertCanvasFileUrlToPath('file:///C:/Users/me/ref.png')).toBe('C:/Users/me/ref.png');
    expect(convertCanvasFileUrlToPath('file://server/share/ref.png')).toBe(
      '\\\\server\\share\\ref.png',
    );

    expect(planCanvasImageSource('https://cdn.test/ref.jpg')).toEqual({
      kind: 'remote-url',
      url: 'https://cdn.test/ref.jpg',
      fallbackMimeType: 'image/jpeg',
    });
    expect(planCanvasImageSource('/tmp/ref.webp')).toEqual({
      kind: 'local-file',
      path: '/tmp/ref.webp',
      mimeType: 'image/webp',
    });
    expect(planCanvasImageSource('raw-base64')).toEqual({
      kind: 'base64',
      base64: 'raw-base64',
      mimeType: 'image/png',
    });
  });

  it('builds canvas media output data URLs with deterministic MIME precedence', () => {
    expect(buildCanvasMediaOutputDataUrl({ mimeType: 'image/webp' }, 'abc', 'image/png')).toBe(
      'data:image/webp;base64,abc',
    );
    expect(buildCanvasMediaOutputDataUrl({}, 'abc', 'image/jpeg')).toBe(
      'data:image/jpeg;base64,abc',
    );
    expect(buildCanvasMediaOutputDataUrl({}, 'abc')).toBe('data:image/png;base64,abc');
  });

  it('builds a normalized media generation request for a canvas node', () => {
    expect(
      buildCanvasImageGenerationRequest(
        {
          ownerScope: OWNER_SCOPE,
          nodeId: 'shot-1',
          cellId: 'cell-1',
          prompt: 'cat detective',
          style: 'anime',
          ratio: '1:1',
          shotScale: 'close-up',
          cameraMovement: 'dolly-in',
          cameraAngle: 'low-angle',
          count: 2.8,
          sourceNodeId: 'source-1',
          characterIds: ['char-1'],
          controlMode: 'depth',
          controlStrength: 0.7,
          negativePrompt: 'blurry',
          referenceRefs: ['gallery-1:front'],
        },
        [{ imageBase64: 'ref', mimeType: 'image/png', strength: 0.6, mode: 'both' }],
      ),
    ).toEqual({
      prompt: 'cat detective, Shot: close-up, Angle: low-angle, Camera: dolly-in, Style: anime',
      aspectRatio: '1:1',
      count: 2,
      metadata: {
        ...OWNER_SCOPE,
        nodeId: 'shot-1',
        sourceNodeId: 'source-1',
        cellId: 'cell-1',
        characterIds: ['char-1'],
        referenceDescriptors: [
          {
            schemaVersion: 1,
            kind: 'reference-descriptor',
            referenceId: 'shot-1:referenceRefs:0',
            sourceKind: 'canvas-node',
            sourceId: 'shot-1',
            referenceKind: 'canvas-node',
            role: 'reference',
            modality: 'image',
            payload: { type: 'canvas-node', nodeId: 'gallery-1', cellId: 'front' },
            metadata: { field: 'referenceRefs', index: 0 },
          },
        ],
      },
      style: 'anime',
      negativePrompt: 'blurry',
      controlMode: 'depth',
      controlStrength: 0.7,
      ipAdapterRefs: [{ imageBase64: 'ref', mimeType: 'image/png', strength: 0.6, mode: 'both' }],
    });
  });

  it('collects Canvas generation referenceRefs as stable descriptors only', () => {
    const descriptors = collectCanvasGenerationReferenceDescriptors({
      ownerScope: OWNER_SCOPE,
      nodeId: 'shot-1',
      prompt: 'cat detective',
      referenceRefs: ['gallery-1:front'],
      ipAdapterRefs: [{ imageBase64: 'runtime-base64' }],
    });

    expect(descriptors).toEqual([
      {
        schemaVersion: 1,
        kind: 'reference-descriptor',
        referenceId: 'shot-1:referenceRefs:0',
        sourceKind: 'canvas-node',
        sourceId: 'shot-1',
        referenceKind: 'canvas-node',
        role: 'reference',
        modality: 'image',
        payload: { type: 'canvas-node', nodeId: 'gallery-1', cellId: 'front' },
        metadata: { field: 'referenceRefs', index: 0 },
      },
    ]);
    expect(JSON.stringify(descriptors)).not.toContain('runtime-base64');
  });

  it('selects gallery and shot image sources deterministically', () => {
    expect(
      selectCanvasReferenceImageSource(
        {
          type: 'gallery',
          data: {
            cells: [
              { id: 'a', image: 'fallback-data-url' },
              { id: 'b', generatedAsset: { path: '/tmp/ref.png' }, image: 'old-data-url' },
            ],
          },
        },
        'b',
      ),
    ).toBe('/tmp/ref.png');

    expect(
      selectCanvasReferenceImageSource({
        type: 'shot',
        data: {
          generatedAsset: { path: '/tmp/shot.png' },
          generatedImage: 'old-data-url',
        },
      }),
    ).toBe('/tmp/shot.png');
  });

  it('resolves referenceRefs through injected canvas and image bridges', async () => {
    const refs = await resolveCanvasIpAdapterReferences(
      {
        ownerScope: OWNER_SCOPE,
        nodeId: 'shot-1',
        prompt: 'prompt',
        referenceRefs: ['gallery-1:cell-2'],
      },
      {
        resolveCanvasNode: async () => ({
          type: 'gallery',
          data: { cells: [{ id: 'cell-2', generatedAsset: { path: '/tmp/ref.webp' } }] },
        }),
        resolveImageSource: async (source) => ({
          base64: `base64:${source}`,
          mimeType: 'image/webp',
        }),
      },
    );

    expect(refs).toEqual([
      {
        imageBase64: 'base64:/tmp/ref.webp',
        mimeType: 'image/webp',
        strength: 0.6,
        mode: 'both',
      },
    ]);
  });

  it('runs image generation and emits progress events', async () => {
    const progress = vi.fn();
    const generateImage = vi
      .fn()
      .mockResolvedValue({ scope: TASK_SCOPE, id: 'task-1', status: 'pending' });
    const waitForTask = vi.fn().mockResolvedValue({
      scope: TASK_SCOPE,
      id: 'task-1',
      status: 'completed',
      outputs: [{ url: 'https://cdn.test/out.png', mimeType: 'image/png' }],
    });
    const runtime = new CanvasGenerationRuntime({
      media: { generateImage, waitForTask },
      fetchOutputAsDataUrl: async () => 'data:image/png;base64,abc',
      onProgress: progress,
    });

    await expect(
      runtime.generateForNode({
        ownerScope: OWNER_SCOPE,
        nodeId: 'shot-1',
        cellId: 'cell-1',
        prompt: 'cat',
      }),
    ).resolves.toEqual({ dataUrl: 'data:image/png;base64,abc' });

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'cat',
        aspectRatio: '16:9',
        count: 1,
        metadata: {
          ...OWNER_SCOPE,
          nodeId: 'shot-1',
          sourceNodeId: 'shot-1',
          cellId: 'cell-1',
        },
      }),
    );
    expect(waitForTask).toHaveBeenCalledWith(TASK_SCOPE, 180000);
    expect(progress).toHaveBeenCalledWith({
      nodeId: 'shot-1',
      taskId: 'task-1',
      cellId: 'cell-1',
      status: 'generating',
    });
    expect(progress).toHaveBeenCalledWith({
      nodeId: 'shot-1',
      taskId: 'task-1',
      cellId: 'cell-1',
      status: 'done',
    });
  });

  it('emits error progress when generation completes without outputs', async () => {
    const progress = vi.fn();
    const runtime = new CanvasGenerationRuntime({
      media: {
        generateImage: async () => ({ scope: TASK_SCOPE, id: 'task-1', status: 'pending' }),
        waitForTask: async () => ({ scope: TASK_SCOPE, id: 'task-1', status: 'failed' }),
      },
      fetchOutputAsDataUrl: async () => 'data:image/png;base64,abc',
      onProgress: progress,
    });

    await expect(
      runtime.generateForNode({ ownerScope: OWNER_SCOPE, nodeId: 'shot-1', prompt: 'cat' }),
    ).resolves.toBe(undefined);
    expect(progress).toHaveBeenLastCalledWith({
      nodeId: 'shot-1',
      taskId: 'task-1',
      status: 'error',
    });
  });

  it('normalizes bounded generation fields', () => {
    expect(normalizeCanvasGenerationCount(undefined)).toBe(1);
    expect(normalizeCanvasGenerationCount(0)).toBe(1);
    expect(normalizeCanvasGenerationCount(3.9)).toBe(3);
    expect(normalizeCanvasControlMode('pose')).toBe('pose');
    expect(normalizeCanvasControlMode('unknown')).toBeUndefined();
  });
});
