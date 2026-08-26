// @vitest-environment jsdom

import type {
  CanvasConnection,
  CanvasGenerationRecipe,
  CanvasGenerationRuntimeProjection,
  CanvasHostSnapshot,
  CanvasNode,
  GenerationCanvasNode,
  MarkdownCanvasNode,
} from '@neko/canvas-domain';
import { createEmptyCanvasData } from '@neko/canvas-domain';
import { CONTENT_LOCATOR_DRAG_MIME, createContentLocatorDragData } from '@neko/content-domain';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasHostProvider, type CanvasWebviewHostPort } from '../../host-runtime';
import { setLocale } from '../../i18n';
import {
  resolveGenerationInputPanelPosition,
  resolveGenerationSelectionSafePan,
  resolveUntouchedRecipeConfiguredDefault,
  SelectionGenerationInputPanel,
} from './SelectionGenerationInputPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(globalThis, {
  ResizeObserver: class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
});

describe('SelectionGenerationInputPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setLocale('en');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it('separates Recipe, references, history and diagnostics from the content node', () => {
    const node = nodeWithHistory();
    const reference = referenceNode();
    render(
      [reference, node],
      [referenceConnection(reference.id, node.id)],
      [node.id],
      createHost({
        nodeId: node.id,
        submissionId: 'submission-2',
        recipeInputFingerprint: 'sha256:recipe-2',
        jobRef: { kind: 'generation', jobId: 'job-2' },
        phase: 'failed',
        recipeStale: true,
        diagnostic: { code: 'provider-failed', message: 'Provider rejected this run.' },
      }),
    );

    expect(container.querySelector('[data-canvas-generation-input="true"]')).not.toBeNull();
    expect(container.querySelector('[data-placement="node-below"]')).not.toBeNull();
    expect(container.querySelector('[data-surface="editor"]')).not.toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="Prompt"]')?.value).toBe(
      'Write a quiet scene',
    );
    expect(container.textContent).toContain('Reference note');
    expect(container.querySelectorAll('select option')).toHaveLength(2);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Provider rejected this run.',
    );
    expect(container.textContent).not.toContain(
      'This output was generated from an earlier Recipe or input.',
    );
    expect(container.textContent).not.toContain('Text generation');
  });

  it('does not render generation input for an ordinary referenced node', () => {
    const reference = referenceNode();
    render([reference], [], [reference.id], createHost());

    expect(container.innerHTML).toBe('');
  });

  it('adds an authorized reference to the exact generation node', async () => {
    const attachGenerationReference = vi.fn(async () => snapshot());
    const node = generationNode({ kind: 'image', prompt: '' });
    render([node], [], [node.id], createHost(undefined, { attachGenerationReference }));

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-canvas-generation-reference-add="true"]')
        ?.click();
    });
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-canvas-generation-reference-source="workspace"]')
        ?.click();
    });

    expect(attachGenerationReference).toHaveBeenCalledWith(node.id, 'image', 'reference');
  });

  it('offers an explicit external import route for reference material', async () => {
    const attachGenerationReference = vi.fn(async () => snapshot());
    const node = generationNode({ kind: 'audio', prompt: '' });
    render([node], [], [node.id], createHost(undefined, { attachGenerationReference }));

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-canvas-generation-reference-add="true"]')
        ?.click();
    });
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('[data-canvas-generation-reference-source="import"]')
        ?.click();
    });

    expect(attachGenerationReference).toHaveBeenCalledWith(node.id, 'audio', 'import');
  });

  it('attaches a compatible dragged Workspace locator to the exact node', async () => {
    const attachGenerationReferenceMaterial = vi.fn(async () => snapshot());
    const node = generationNode({ kind: 'image', prompt: '' });
    render([node], [], [node.id], createHost(undefined, { attachGenerationReferenceMaterial }));
    const payload = JSON.stringify(
      createContentLocatorDragData({
        locator: { file: { authority: 'workspace', path: 'media/reference.png' } },
        name: 'reference.png',
      }),
    );
    const dataTransfer = {
      types: [CONTENT_LOCATOR_DRAG_MIME],
      dropEffect: 'none',
      getData: (type: string) => (type === CONTENT_LOCATOR_DRAG_MIME ? payload : ''),
    };
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });

    await act(async () => {
      container
        .querySelector<HTMLElement>('[data-canvas-generation-reference-zone="true"]')
        ?.dispatchEvent(drop);
      await Promise.resolve();
    });

    expect(attachGenerationReferenceMaterial).toHaveBeenCalledWith(node.id, {
      locator: { file: { authority: 'workspace', path: 'media/reference.png' } },
      mediaKind: 'image',
      title: 'reference.png',
    });
  });

  it('persists the current Recipe before explicitly running the exact node', async () => {
    const updateGenerationRecipe = vi.fn(async (_nodeId: string, _recipe: CanvasGenerationRecipe) =>
      snapshot(),
    );
    const runGenerationNode = vi.fn(async () => snapshot());
    const node = nodeWithHistory();
    render(
      [node],
      [],
      [node.id],
      createHost(undefined, { updateGenerationRecipe, runGenerationNode }),
    );

    act(() => {
      const prompt = container.querySelector<HTMLTextAreaElement>('[aria-label="Prompt"]');
      if (!prompt) throw new Error('Prompt control is unavailable.');
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!setValue) throw new Error('Prompt value setter is unavailable.');
      setValue.call(prompt, 'Write a quieter scene');
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="Run"]')?.click();
    });

    expect(updateGenerationRecipe).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({ kind: 'prompt', prompt: 'Write a quieter scene' }),
    );
    expect(runGenerationNode).toHaveBeenCalledWith(node.id);
    expect(updateGenerationRecipe.mock.invocationCallOrder[0]).toBeLessThan(
      runGenerationNode.mock.invocationCallOrder[0]!,
    );
  });

  it('cancels the exact node while its run is active', async () => {
    const cancelGenerationNode = vi.fn(async () => snapshot());
    const node = nodeWithHistory();
    render(
      [node],
      [],
      [node.id],
      createHost(
        {
          nodeId: node.id,
          submissionId: 'submission-2',
          recipeInputFingerprint: 'sha256:recipe-2',
          jobRef: { kind: 'generation', jobId: 'job-2' },
          phase: 'running',
        },
        { cancelGenerationNode },
      ),
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="Cancel"]')?.click();
    });

    expect(cancelGenerationNode).toHaveBeenCalledWith(node.id);
  });

  it.each([
    { kind: 'prompt', prompt: '' } satisfies CanvasGenerationRecipe,
    { kind: 'image', prompt: '' } satisfies CanvasGenerationRecipe,
    { kind: 'audio', prompt: '' } satisfies CanvasGenerationRecipe,
    { kind: 'video', prompt: '' } satisfies CanvasGenerationRecipe,
  ])('renders the typed parameter selector for %s', async (recipe) => {
    const node = generationNode(recipe);
    render([node], [], [node.id], createHost());
    await act(async () => Promise.resolve());

    expect(container.querySelector('[aria-label="Parameters"]')).not.toBeNull();
  });

  it('selects only a configured model for the exact image purpose', async () => {
    const updateGenerationRecipe = vi.fn(async () => snapshot());
    const node = generationNode({ kind: 'image', prompt: 'A quiet lake' });
    render([node], [], [node.id], createHost(undefined, { updateGenerationRecipe }));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Model"]')?.click();
    });
    const selectedOption = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    ).find((button) => button.textContent?.includes('Image Model'));
    expect(selectedOption?.querySelector('span')?.children).toHaveLength(2);
    expect(selectedOption?.querySelector('strong')?.textContent).toBe('Image Model');
    expect(selectedOption?.querySelector('small')?.textContent).toBe('Provider One');
    expect(document.body.textContent).toContain('Image Model');
    expect(document.body.textContent).not.toContain('Video Model');
    await act(async () => {
      selectedOption?.click();
    });

    expect(updateGenerationRecipe).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({
        model: {
          purpose: 'image.generate',
          providerId: 'provider-1',
          modelId: 'image-model-1',
        },
      }),
    );
  });

  it('adopts the exact configured default and canonical parameters for an untouched unset Recipe', async () => {
    const updateGenerationRecipe = vi.fn(async () => snapshot());
    const node = generationNode({ kind: 'image', prompt: '' });

    expect(resolveUntouchedRecipeConfiguredDefault(node, [], GENERATION_MODELS)).toEqual({
      kind: 'image',
      prompt: '',
      model: {
        purpose: 'image.generate',
        providerId: 'provider-1',
        modelId: 'image-model-1',
      },
      aspectRatio: '1:1',
      width: 1024,
      height: 1024,
      count: 1,
      quality: 'standard',
    });

    render([node], [], [node.id], createHost(undefined, { updateGenerationRecipe }));
    await act(async () => Promise.resolve());

    expect(updateGenerationRecipe).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({
        model: {
          purpose: 'image.generate',
          providerId: 'provider-1',
          modelId: 'image-model-1',
        },
        aspectRatio: '1:1',
        width: 1024,
        height: 1024,
        quality: 'standard',
        count: 1,
      }),
    );
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Model"]')?.textContent,
    ).toContain('Image Model');
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Parameters"]')?.textContent,
    ).toContain('1:1 · 1K · Medium');
    expect(
      container.querySelector<HTMLButtonElement>('[aria-label="Count"]')?.textContent,
    ).toContain('× 1');
  });

  it('does not replace an authored unset Recipe with the configured default', () => {
    const node = generationNode({ kind: 'image', prompt: 'Keep my authored prompt' });
    expect(resolveUntouchedRecipeConfiguredDefault(node, [], GENERATION_MODELS)).toBeUndefined();
  });

  it('edits bounded image parameters from the parameter popover', async () => {
    const updateGenerationRecipe = vi.fn(async () => snapshot());
    const node = generationNode({ kind: 'image', prompt: '' });
    render([node], [], [node.id], createHost(undefined, { updateGenerationRecipe }));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Parameters"]')?.click();
    });
    const parameterMenu = document.querySelector<HTMLElement>(
      '.selection-generation-input-panel__parameter-menu',
    );
    expect(parameterMenu?.style.getPropertyValue('--generation-input-panel-width')).toBe('520px');
    expect(
      parameterMenu?.querySelectorAll('.selection-generation-input-panel__option-group'),
    ).toHaveLength(3);
    expect(
      parameterMenu?.querySelectorAll(
        '.selection-generation-input-panel__option-group[data-option-layout="ratio"] button',
      ),
    ).toHaveLength(14);
    expect(
      parameterMenu?.querySelectorAll(
        '.selection-generation-input-panel__option-group[data-option-layout="equal"] button',
      ),
    ).toHaveLength(3);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="Aspect ratio: 16:9"]')?.click();
      document.querySelector<HTMLButtonElement>('[aria-label="Resolution: 4K"]')?.click();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Count"]')?.click();
    });
    const countMenu = document.querySelector<HTMLElement>(
      '.selection-generation-input-panel__count-menu',
    );
    expect(countMenu?.querySelectorAll('[role="menuitemradio"]')).toHaveLength(4);
    await act(async () => {
      Array.from(countMenu?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])
        .find((button) => button.textContent?.trim() === '× 2')
        ?.click();
    });

    expect(updateGenerationRecipe).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({ kind: 'image', count: 2, width: 4096 }),
    );
  });

  it('repairs stale video parameters and exposes only controls accepted by the model', async () => {
    const updateGenerationRecipe = vi.fn(async (_nodeId: string, _recipe: CanvasGenerationRecipe) =>
      snapshot(),
    );
    const node = generationNode({
      kind: 'video',
      prompt: 'A cat waving at the camera',
      model: GENERATION_MODELS[2].binding,
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
      fps: 24,
    });
    render([node], [], [node.id], createHost(undefined, { updateGenerationRecipe }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateGenerationRecipe).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({
        kind: 'video',
        resolution: '768P',
        duration: 5,
        aspectRatio: '16:9',
      }),
    );
    const repairedRecipe = updateGenerationRecipe.mock.calls.at(-1)?.[1];
    expect(repairedRecipe).not.toHaveProperty('fps');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Parameters were adjusted to match Video Model',
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Parameters"]')?.click();
    });
    const parameterMenu = document.querySelector<HTMLElement>(
      '.selection-generation-input-panel__parameter-menu',
    );
    expect(
      parameterMenu?.querySelectorAll('.selection-generation-input-panel__option-group'),
    ).toHaveLength(3);
    expect(parameterMenu?.textContent).toContain('768P');
    expect(parameterMenu?.textContent).toContain('2K');
    expect(parameterMenu?.textContent).not.toContain('Frame rate');
    expect(parameterMenu?.textContent).not.toContain('720p');
  });

  it('shows Seedance audio generation without exposing its fixed FPS as editable', async () => {
    const updateGenerationRecipe = vi.fn(async () => snapshot());
    const node = generationNode({
      kind: 'video',
      prompt: 'A quiet cinematic street',
      model: SEEDANCE_MODEL.binding,
      aspectRatio: 'adaptive',
      resolution: '720p',
      duration: 5,
    });
    const host = createHost(undefined, {
      updateGenerationRecipe,
      getAuthoringCapabilities: () => ({
        sourceModes: [],
        generationKinds: ['prompt', 'image', 'audio', 'video'],
        generationModels: [SEEDANCE_MODEL],
      }),
    });
    render([node], [], [node.id], host);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Parameters"]')?.click();
    });
    const parameterMenu = document.querySelector<HTMLElement>(
      '.selection-generation-input-panel__parameter-menu',
    );
    expect(
      parameterMenu?.querySelectorAll('.selection-generation-input-panel__option-group'),
    ).toHaveLength(4);
    expect(parameterMenu?.textContent).toContain('adaptive');
    expect(parameterMenu?.textContent).toContain('4k');
    expect(parameterMenu?.textContent).toContain('Generate audio');
    expect(parameterMenu?.textContent).not.toContain('Frame rate');

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="Generate audio: Enabled"]')?.click();
    });
    expect(updateGenerationRecipe).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({ generateAudio: true }),
    );
  });

  it('conforms parameters when switching from Seedance to MiniMax H3', async () => {
    const updateGenerationRecipe = vi.fn(async (_nodeId: string, _recipe: CanvasGenerationRecipe) =>
      snapshot(),
    );
    const minimaxModel = { ...GENERATION_MODELS[2], isDefault: false };
    const node = generationNode({
      kind: 'video',
      prompt: 'Switch this shot',
      model: SEEDANCE_MODEL.binding,
      aspectRatio: 'adaptive',
      resolution: '4k',
      duration: 15,
      generateAudio: true,
    });
    render(
      [node],
      [],
      [node.id],
      createHost(undefined, {
        updateGenerationRecipe,
        getAuthoringCapabilities: () => ({
          sourceModes: [],
          generationKinds: ['prompt', 'image', 'audio', 'video'],
          generationModels: [SEEDANCE_MODEL, minimaxModel],
        }),
      }),
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Model"]')?.click();
    });
    const minimaxOption = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    ).find((button) => button.textContent?.includes('Video Model'));
    await act(async () => {
      minimaxOption?.click();
    });

    const switchedRecipe = updateGenerationRecipe.mock.calls.at(-1)?.[1];
    expect(switchedRecipe).toEqual({
      kind: 'video',
      prompt: 'Switch this shot',
      model: minimaxModel.binding,
      aspectRatio: '16:9',
      resolution: '768P',
      duration: 15,
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Parameters were adjusted to match Video Model',
    );
  });

  it('clears hidden video parameters when a custom model has no verified profile', async () => {
    const updateGenerationRecipe = vi.fn(async () => snapshot());
    const customModel = {
      binding: {
        purpose: 'video.generate' as const,
        providerId: 'custom-provider',
        modelId: 'custom-video',
      },
      label: 'Custom Video',
      providerLabel: 'Custom Provider',
      isDefault: true,
    };
    const node = generationNode({
      kind: 'video',
      prompt: 'A safe request',
      model: customModel.binding,
      resolution: '720p',
      fps: 24,
    });
    render(
      [node],
      [],
      [node.id],
      createHost(undefined, {
        updateGenerationRecipe,
        getAuthoringCapabilities: () => ({
          sourceModes: [],
          generationKinds: ['prompt', 'image', 'audio', 'video'],
          generationModels: [customModel],
        }),
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateGenerationRecipe).toHaveBeenCalledWith(node.id, {
      kind: 'video',
      prompt: 'A safe request',
      model: customModel.binding,
    });
    expect(container.querySelector('[aria-label="Parameters"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'no verified parameter profile',
    );
  });

  it('switches one Audio node to music mode and filters the model purpose', async () => {
    const updateGenerationRecipe = vi.fn(async (_nodeId: string, _recipe: CanvasGenerationRecipe) =>
      snapshot(),
    );
    const node = generationNode({
      kind: 'audio',
      prompt: '',
      model: {
        purpose: 'audio.generate',
        providerId: 'provider-1',
        modelId: 'audio-model-1',
      },
    });
    render([node], [], [node.id], createHost(undefined, { updateGenerationRecipe }));

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((button) => button.textContent === 'Music generation')
        ?.click();
    });
    expect(updateGenerationRecipe).toHaveBeenCalledWith(
      node.id,
      expect.objectContaining({
        kind: 'audio',
        isMusic: true,
        model: {
          purpose: 'audio.music.generate',
          providerId: 'provider-1',
          modelId: 'music-model-1',
        },
      }),
    );
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Model"]')?.click();
    });
    expect(document.body.textContent).toContain('Music Model');
    expect(document.body.textContent).not.toContain('Audio Model');
  });

  it('keeps the node-anchored panel compact at a fixed gap in a narrow viewport', () => {
    const node = nodeWithHistory();
    render([node], [], [node.id], createHost(), { width: 320, height: 640 });

    expect(
      container.querySelector<HTMLElement>('[data-canvas-generation-input="true"]')?.style.width,
    ).toBe('288px');
    expect(
      container.querySelector<HTMLElement>('[data-canvas-generation-input="true"]')?.style.top,
    ).toBe('416px');
    expect(
      container.querySelector<HTMLElement>('[data-canvas-generation-input="true"]')?.style
        .minHeight,
    ).toBe('224px');
  });

  it('uses a compact node-following composer on desktop', () => {
    const node = nodeWithHistory();
    render([node], [], [node.id], createHost(), { width: 1000, height: 700 });

    const panel = container.querySelector<HTMLElement>('[data-canvas-generation-input="true"]');
    expect(panel?.style.width).toBe('520px');
    expect(panel?.style.left).toBe('400px');
    expect(panel?.style.top).toBe('416px');
    expect(panel?.style.minHeight).toBe('210px');
    expect(
      panel?.querySelector('.selection-generation-input-panel__reference-slot'),
    ).not.toBeNull();
    expect(panel?.querySelector('.selection-generation-input-panel__controls')).not.toBeNull();
  });

  it('follows the exact node through viewport pan and zoom without independently flipping', () => {
    const node = generationNode({ kind: 'prompt', prompt: '' });

    expect(
      resolveGenerationInputPanelPosition(
        node,
        { pan: { x: 100, y: 50 }, zoom: 0.5 },
        { width: 1000, height: 700 },
      ),
    ).toMatchObject({ x: 300, top: 266, width: 520, placement: 'node-below' });
    expect(
      resolveGenerationInputPanelPosition(
        { ...node, position: { x: 240, y: 430 } },
        { pan: { x: 0, y: 0 }, zoom: 1 },
        { width: 1000, height: 700 },
      ),
    ).toMatchObject({ x: 400, top: 686, placement: 'node-below' });
  });

  it('pans only as needed to keep the toolbar-node-composer stack visible', () => {
    const node = generationNode({ kind: 'prompt', prompt: '' });

    expect(
      resolveGenerationSelectionSafePan(
        node,
        { pan: { x: 12, y: 0 }, zoom: 1 },
        { width: 500, height: 640 },
      ),
    ).toEqual({ x: -150, y: -16 });
    expect(
      resolveGenerationSelectionSafePan(
        node,
        { pan: { x: 12, y: 0 }, zoom: 1 },
        { width: 1000, height: 700 },
      ),
    ).toBeUndefined();
    expect(
      resolveGenerationSelectionSafePan(
        node,
        { pan: { x: 12, y: 0 }, zoom: 1 },
        { width: 500, height: 640 },
        360,
      ),
    ).toEqual({ x: -150, y: 0 });
  });

  function render(
    nodes: readonly CanvasNode[],
    connections: readonly CanvasConnection[],
    selectedNodeIds: readonly string[],
    host: CanvasWebviewHostPort,
    viewportSize = { width: 800, height: 700 },
    viewport = { pan: { x: 0, y: 0 }, zoom: 1 },
  ): void {
    act(() => {
      root.render(
        <CanvasHostProvider host={host}>
          <SelectionGenerationInputPanel
            nodes={nodes}
            connections={connections}
            selectedNodeIds={selectedNodeIds}
            viewport={viewport}
            viewportSize={viewportSize}
          />
        </CanvasHostProvider>,
      );
    });
  }
});

function referenceNode(): MarkdownCanvasNode {
  return {
    id: 'reference-1',
    type: 'markdown',
    position: { x: 20, y: 30 },
    size: { width: 240, height: 160 },
    zIndex: 0,
    data: { content: '# Reference note\nA stable text input.' },
  };
}

function referenceConnection(sourceId: string, targetId: string): CanvasConnection {
  return {
    id: 'reference-connection-1',
    sourceId,
    targetId,
    type: 'reference',
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'port', portId: 'reference' },
  };
}

function generationNode(recipe: CanvasGenerationRecipe): GenerationCanvasNode {
  return {
    id: `generation-${recipe.kind}`,
    type: 'generation',
    position: { x: 240, y: 160 },
    size: { width: 320, height: 240 },
    zIndex: 1,
    data: { recipe, outputs: [] },
  };
}

function nodeWithHistory(): GenerationCanvasNode {
  const node = generationNode({
    kind: 'prompt',
    prompt: 'Write a quiet scene',
    model: {
      purpose: 'canvas.prompt',
      providerId: 'provider-1',
      modelId: 'text-model-1',
    },
  });
  const first = output('output-1', 'job-1', 'sha256:recipe-1');
  const second = output('output-2', 'job-2', 'sha256:recipe-2');
  return {
    ...node,
    id: 'generation-1',
    data: {
      ...node.data,
      latestRun: {
        submissionId: 'submission-2',
        recipeInputFingerprint: 'sha256:recipe-2',
        jobRef: { kind: 'generation', jobId: 'job-2' },
      },
      outputs: [first, second],
      selectedOutputId: second.outputId,
    },
  };
}

function output(outputId: string, jobId: string, recipeInputFingerprint: string) {
  return {
    outputId,
    jobRef: { kind: 'generation' as const, jobId },
    locator: {
      file: {
        authority: 'workspace' as const,
        path: `neko/generated/prompt/${outputId}.txt`,
      },
    },
    kind: 'prompt' as const,
    recipeInputFingerprint,
  };
}

function createHost(
  projection?: CanvasGenerationRuntimeProjection,
  overrides: Partial<CanvasWebviewHostPort> = {},
): CanvasWebviewHostPort {
  return {
    documentId: 'canvas-document-1',
    postMessage: () => undefined,
    getState: () => undefined,
    setState: () => undefined,
    supportsMessage: () => false,
    subscribe: () => () => undefined,
    requestSource: async () => {
      throw new Error('Source selection is not used by this test.');
    },
    createGenerationNode: async () => snapshot(),
    attachGenerationReference: async () => snapshot(),
    attachGenerationReferenceMaterial: async () => snapshot(),
    updateGenerationRecipe: async () => snapshot(),
    runGenerationNode: async () => snapshot(),
    cancelGenerationNode: async () => snapshot(),
    selectGenerationOutput: async () => snapshot(),
    getGenerationProjection: () => projection,
    projectContent: async () => snapshot(),
    previewResource: async () => undefined,
    revealResource: async () => undefined,
    readTextFilePreview: async (nodeId) => ({
      requestId: 'fixture-text-preview',
      nodeId,
      status: 'unsupported',
    }),
    getAuthoringCapabilities: () => ({
      sourceModes: [],
      generationKinds: ['prompt', 'image', 'audio', 'video'],
      generationModels: GENERATION_MODELS,
    }),
    resolveMaterialActions: async () => [],
    executeMaterialAction: async () => snapshot(),
    dispose: () => undefined,
    ...overrides,
  };
}

function snapshot(): CanvasHostSnapshot {
  return {
    identity: {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'canvas-view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'canvas-document-1',
      sessionId: 'canvas-session-1',
      rendererSessionId: 'renderer-session-1',
    },
    dirty: false,
    canvas: createEmptyCanvasData('Fixture'),
    presentation: {
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      selectedNodeIds: [],
    },
    authoringCapabilities: {
      sourceModes: [],
      generationKinds: ['prompt', 'image', 'audio', 'video'],
      generationModels: GENERATION_MODELS,
    },
    generationNodes: [],
  };
}

const GENERATION_MODELS = [
  {
    binding: {
      purpose: 'canvas.prompt' as const,
      providerId: 'provider-1',
      modelId: 'text-model-1',
    },
    label: 'Text Model',
    providerLabel: 'Provider One',
    isDefault: true,
  },
  {
    binding: {
      purpose: 'image.generate' as const,
      providerId: 'provider-1',
      modelId: 'image-model-1',
    },
    label: 'Image Model',
    providerLabel: 'Provider One',
    isDefault: true,
  },
  {
    binding: {
      purpose: 'video.generate' as const,
      providerId: 'provider-1',
      modelId: 'video-model-1',
    },
    label: 'Video Model',
    providerLabel: 'Provider One',
    isDefault: true,
    parameterProfile: {
      kind: 'video' as const,
      supportedParameters: ['duration', 'resolution', 'aspectRatio'] as const,
      controls: {
        aspectRatio: {
          kind: 'string-enum' as const,
          required: true,
          values: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
          defaultValue: '16:9',
        },
        resolution: {
          kind: 'string-enum' as const,
          required: true,
          values: ['768P', '2K'],
          defaultValue: '768P',
        },
        duration: {
          kind: 'integer' as const,
          required: true,
          min: 4,
          max: 15,
          step: 1,
          defaultValue: 5,
        },
      },
      fixed: { outputCount: 1 as const },
    },
  },
  {
    binding: {
      purpose: 'audio.generate' as const,
      providerId: 'provider-1',
      modelId: 'audio-model-1',
    },
    label: 'Audio Model',
    providerLabel: 'Provider One',
    isDefault: true,
  },
  {
    binding: {
      purpose: 'audio.music.generate' as const,
      providerId: 'provider-1',
      modelId: 'music-model-1',
    },
    label: 'Music Model',
    providerLabel: 'Provider One',
    isDefault: true,
  },
] as const;

const SEEDANCE_MODEL = {
  binding: {
    purpose: 'video.generate' as const,
    providerId: 'bytedance-provider',
    modelId: 'seedance-2',
  },
  label: 'Seedance 2.0',
  providerLabel: 'ByteDance',
  isDefault: true,
  parameterProfile: {
    kind: 'video' as const,
    supportedParameters: ['duration', 'resolution', 'aspectRatio', 'generateAudio'] as const,
    controls: {
      aspectRatio: {
        kind: 'string-enum' as const,
        required: true,
        values: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        defaultValue: 'adaptive',
      },
      resolution: {
        kind: 'string-enum' as const,
        required: true,
        values: ['480p', '720p', '1080p', '4k'],
        defaultValue: '720p',
      },
      duration: {
        kind: 'integer' as const,
        required: true,
        min: 4,
        max: 15,
        step: 1,
        defaultValue: 5,
      },
      generateAudio: { kind: 'boolean' as const, required: false },
    },
    fixed: { outputCount: 1 as const, fps: 24 },
  },
} as const;
