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
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasHostProvider, type CanvasWebviewHostPort } from '../../host-runtime';
import { setLocale } from '../../i18n';
import {
  resolveGenerationSelectionSafePan,
  SelectionGenerationInputPanel,
} from './SelectionGenerationInputPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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
    expect(container.querySelector('[data-placement="viewport-bottom"]')).not.toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>('[aria-label="Prompt"]')?.value).toBe(
      'Write a quiet scene',
    );
    expect(container.textContent).toContain('Reference note');
    expect(container.querySelectorAll('select option')).toHaveLength(2);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Provider rejected this run.',
    );
    expect(container.querySelector('[data-canvas-generation-recipe-stale="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Text generation');
  });

  it('does not render generation input for an ordinary referenced node', () => {
    const reference = referenceNode();
    render([reference], [], [reference.id], createHost());

    expect(container.innerHTML).toBe('');
  });

  it('persists the current Recipe before explicitly running the exact node', async () => {
    const updateGenerationRecipe = vi.fn(async () => snapshot());
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
    [{ kind: 'prompt', prompt: '' } satisfies CanvasGenerationRecipe, 'Temperature'],
    [{ kind: 'image', prompt: '' } satisfies CanvasGenerationRecipe, 'Aspect ratio'],
    [{ kind: 'audio', prompt: '' } satisfies CanvasGenerationRecipe, 'Duration'],
    [{ kind: 'video', prompt: '' } satisfies CanvasGenerationRecipe, 'Resolution'],
  ])('renders the legal controls for %s', (recipe, expectedControl) => {
    const node = generationNode(recipe);
    render([node], [], [node.id], createHost());

    expect(container.querySelector(`[aria-label="${expectedControl}"]`)).not.toBeNull();
  });

  it('keeps the detached panel within a compact viewport width', () => {
    const node = nodeWithHistory();
    render([node], [], [node.id], createHost(), { width: 320, height: 640 });

    expect(
      container.querySelector<HTMLElement>('[data-canvas-generation-input="true"]')?.style.width,
    ).toBe('296px');
    expect(
      container.querySelector<HTMLElement>('[data-canvas-generation-input="true"]')?.style.bottom,
    ).toBe('16px');
    expect(
      container.querySelector<HTMLElement>('[data-canvas-generation-input="true"]')?.style
        .minHeight,
    ).toBe('246px');
    expect(
      container.querySelector<HTMLElement>('[data-canvas-generation-input="true"]')?.style.top,
    ).toBe('');
  });

  it('uses a wide viewport-bottom composer on desktop', () => {
    const node = nodeWithHistory();
    render([node], [], [node.id], createHost(), { width: 1000, height: 700 });

    const panel = container.querySelector<HTMLElement>('[data-canvas-generation-input="true"]');
    expect(panel?.style.width).toBe('760px');
    expect(panel?.style.left).toBe('500px');
    expect(panel?.style.minHeight).toBe('214px');
    expect(
      panel?.querySelector('.selection-generation-input-panel__reference-slot'),
    ).not.toBeNull();
    expect(panel?.querySelector('.selection-generation-input-panel__controls')).not.toBeNull();
  });

  it('moves a selected generation node above the compact composer safe area', () => {
    const node = generationNode({ kind: 'prompt', prompt: '' });

    expect(
      resolveGenerationSelectionSafePan(
        node,
        { pan: { x: 12, y: 0 }, zoom: 1 },
        { width: 500, height: 640 },
      ),
    ).toEqual({ x: 12, y: -38 });
    expect(
      resolveGenerationSelectionSafePan(
        node,
        { pan: { x: 12, y: 0 }, zoom: 1 },
        { width: 1000, height: 700 },
      ),
    ).toBeUndefined();
  });

  function render(
    nodes: readonly CanvasNode[],
    connections: readonly CanvasConnection[],
    selectedNodeIds: readonly string[],
    host: CanvasWebviewHostPort,
    viewportSize = { width: 800, height: 700 },
  ): void {
    act(() => {
      root.render(
        <CanvasHostProvider host={host}>
          <SelectionGenerationInputPanel
            nodes={nodes}
            connections={connections}
            selectedNodeIds={selectedNodeIds}
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
      kind: 'generated-output' as const,
      outputId,
      digest: `sha256:${outputId}`,
      path: `neko/generated/prompt/${outputId}.txt`,
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
    updateGenerationRecipe: async () => snapshot(),
    runGenerationNode: async () => snapshot(),
    cancelGenerationNode: async () => snapshot(),
    selectGenerationOutput: async () => snapshot(),
    authorGenerationText: async () => snapshot(),
    getGenerationProjection: () => projection,
    projectContent: async () => snapshot(),
    previewResource: async () => undefined,
    revealResource: async () => undefined,
    getAuthoringCapabilities: () => ({ sourceModes: [], generationKinds: [] }),
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
    authoringCapabilities: { sourceModes: [], generationKinds: [] },
    generationNodes: [],
  };
}
