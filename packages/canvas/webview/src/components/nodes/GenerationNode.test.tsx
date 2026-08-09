// @vitest-environment jsdom

import type {
  CanvasGenerationRuntimeProjection,
  CanvasHostSnapshot,
  GenerationCanvasNode,
} from '@neko/canvas-domain';
import { createEmptyCanvasData } from '@neko/canvas-domain';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasHostProvider, type CanvasWebviewHostPort } from '../../host-runtime';
import { setLocale } from '../../i18n';
import { GenerationNode } from './GenerationNode';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('GenerationNode', () => {
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

  it('renders selected text, history, diagnostic and stale Recipe state on one node', () => {
    render(
      nodeWithHistory(),
      createHost({
        nodeId: 'generation-1',
        submissionId: 'submission-2',
        recipeInputFingerprint: 'sha256:recipe-2',
        jobRef: { kind: 'generation', jobId: 'job-2' },
        phase: 'failed',
        text: 'Previously generated scene',
        recipeStale: true,
        diagnostic: { code: 'provider-failed', message: 'Provider rejected this run.' },
      }),
    );

    expect(container.textContent).toContain('Previously generated scene');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Provider rejected this run.',
    );
    expect(container.querySelector('[data-canvas-generation-recipe-stale="true"]')).not.toBeNull();
    expect(container.querySelectorAll('select option')).toHaveLength(2);
  });

  it('persists the current Recipe before an explicit run', async () => {
    const updateGenerationRecipe = vi.fn(async () => snapshot());
    const runGenerationNode = vi.fn(async () => snapshot());
    render(nodeWithHistory(), createHost(undefined, { updateGenerationRecipe, runGenerationNode }));

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="Run"]')?.click();
    });

    expect(updateGenerationRecipe).toHaveBeenCalledWith(
      'generation-1',
      expect.objectContaining({ kind: 'prompt', prompt: 'Write a quiet scene' }),
    );
    expect(runGenerationNode).toHaveBeenCalledWith('generation-1');
    expect(updateGenerationRecipe.mock.invocationCallOrder[0]).toBeLessThan(
      runGenerationNode.mock.invocationCallOrder[0]!,
    );
  });

  it('cancels the exact node while a run is active', async () => {
    const cancelGenerationNode = vi.fn(async () => snapshot());
    render(
      nodeWithHistory(),
      createHost(
        {
          nodeId: 'generation-1',
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

    expect(cancelGenerationNode).toHaveBeenCalledWith('generation-1');
  });

  function render(node: GenerationCanvasNode, host: CanvasWebviewHostPort): void {
    act(() => {
      root.render(
        <CanvasHostProvider host={host}>
          <GenerationNode
            node={node}
            viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
            isSelected
            containerRef={{ current: container }}
          />
        </CanvasHostProvider>,
      );
    });
  }
});

function nodeWithHistory(): GenerationCanvasNode {
  const first = output('output-1', 'job-1', 'sha256:recipe-1');
  const second = output('output-2', 'job-2', 'sha256:recipe-2');
  return {
    id: 'generation-1',
    type: 'generation',
    position: { x: 20, y: 30 },
    size: { width: 320, height: 320 },
    zIndex: 1,
    data: {
      recipe: {
        kind: 'prompt',
        prompt: 'Write a quiet scene',
        model: {
          purpose: 'canvas.prompt',
          providerId: 'provider-1',
          modelId: 'text-model-1',
        },
      },
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
