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
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('renders generated text as Text content without a Generation task-card header', () => {
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
    expect(container.textContent).toContain('Text');
    expect(container.textContent).not.toContain('Text generation');
    expect(container.textContent).toContain('Failed');
    expect(container.querySelector('[data-canvas-content-kind="text"]')).not.toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('button[title="Run"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('opens the Canvas fullscreen preview when a generated Text node is double-clicked', async () => {
    const onFullscreenPreview = vi.fn();
    const node = nodeWithHistory();
    render(node, createHost(), onFullscreenPreview);

    await act(async () => {
      container
        .querySelector<HTMLElement>('[data-node-id="generation-1"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(onFullscreenPreview).toHaveBeenCalledWith('generation-1', 'output-2');
  });

  it('presents one Job image batch side by side and selects a visible member without hiding siblings', async () => {
    const selectGenerationOutput = vi.fn(async () => snapshot());
    const onFullscreenPreview = vi.fn();
    const node = imageNodeWithBatch();

    render(node, createHost(undefined, { selectGenerationOutput }), onFullscreenPreview);

    expect(container.querySelector('[data-generation-result-count="2"]')).not.toBeNull();
    expect(container.querySelector('[data-generation-layout="grid"]')).not.toBeNull();
    expect(container.textContent).toContain('2 outputs');
    const choices = container.querySelectorAll<HTMLButtonElement>(
      '.canvas-generation-node__result-grid-item',
    );
    expect(choices).toHaveLength(2);
    expect(choices[0]?.getAttribute('data-generation-output-id')).toBe('image-output-1');
    expect(choices[1]?.getAttribute('data-generation-output-id')).toBe('image-output-2');
    expect(choices[1]?.getAttribute('aria-pressed')).toBe('true');
    const frame = container.querySelector<HTMLElement>('.canvas-generation-node-frame');
    expect(frame?.style.width).toBe('320px');
    expect(frame?.style.height).toBe('240px');

    await act(async () => choices[0]?.click());
    expect(selectGenerationOutput).toHaveBeenCalledWith('generation-image', 'image-output-1');
    expect(container.querySelectorAll('.canvas-generation-node__result-grid-item')).toHaveLength(2);
    expect(frame?.style.width).toBe('320px');
    expect(frame?.style.height).toBe('240px');

    await act(async () => {
      choices[0]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(onFullscreenPreview).toHaveBeenCalledWith('generation-image', 'image-output-1');
  });

  it('keeps four outputs in one bounded two-column result grid', () => {
    render(imageNodeWithBatch(4), createHost());

    expect(container.querySelectorAll('.canvas-generation-node__result-grid-item')).toHaveLength(4);
    expect(container.querySelector('.canvas-generation-node__result-grid--dense')).not.toBeNull();
    expect(container.textContent).toContain('4 outputs');
    const frame = container.querySelector<HTMLElement>('.canvas-generation-node-frame');
    expect(frame?.style.width).toBe('320px');
    expect(frame?.style.height).toBe('240px');
  });

  it('preserves an earlier image group and reports a later Job failure only at group level', () => {
    const node = imageNodeWithBatch();
    render(
      node,
      createHost({
        nodeId: node.id,
        submissionId: 'submission-later',
        recipeInputFingerprint: 'sha256:later',
        jobRef: { kind: 'generation', jobId: 'job-later' },
        phase: 'failed',
        createdAt: 1_000,
        updatedAt: 4_000,
        progress: { stage: 'waiting-provider', percent: 60 },
        diagnostic: { code: 'provider-failed', message: 'The later Job failed.' },
      }),
    );

    expect(container.querySelector('[data-generation-result-count="2"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-generation-phase="failed"]')).toHaveLength(1);
    expect(container.textContent).toContain('Failed');
    expect(container.textContent).toContain('3s');
    expect(container.querySelectorAll('.canvas-generation-node__result-grid-item')).toHaveLength(2);
  });

  it('shows authoritative progress stage, percentage and elapsed time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(13_000);
    const node: GenerationCanvasNode = {
      id: 'generation-image',
      type: 'generation',
      position: { x: 20, y: 30 },
      size: { width: 320, height: 240 },
      zIndex: 1,
      data: { recipe: { kind: 'image', prompt: '', count: 2 }, outputs: [] },
    };
    render(
      node,
      createHost({
        nodeId: node.id,
        submissionId: 'submission-image',
        recipeInputFingerprint: 'sha256:image',
        jobRef: { kind: 'generation', jobId: 'job-image' },
        phase: 'running',
        createdAt: 3_000,
        updatedAt: 12_000,
        progress: { stage: 'waiting-provider', percent: 42 },
      }),
    );

    const status = container.querySelector('[data-generation-phase="running"]');
    expect(status?.textContent).toContain('Generating');
    expect(status?.textContent).toContain('10s');
    expect(status?.textContent).toContain('42%');
    expect(container.textContent).toContain('2 outputs');
    expect(container.querySelector('.canvas-generation-node__activity-scan')).not.toBeNull();
    expect(
      container.querySelector('.canvas-generation-node__result-stack--pending'),
    ).not.toBeNull();
    expect(container.querySelector('.canvas-generation-node__result-grid')).toBeNull();
  });

  it('centers a failed Image placeholder in the full content surface without result stack layers', () => {
    const node: GenerationCanvasNode = {
      id: 'generation-image',
      type: 'generation',
      position: { x: 20, y: 30 },
      size: { width: 320, height: 240 },
      zIndex: 1,
      data: { recipe: { kind: 'image', prompt: 'Two quiet frames', count: 2 }, outputs: [] },
    };
    render(
      node,
      createHost({
        nodeId: node.id,
        submissionId: 'submission-image',
        recipeInputFingerprint: 'sha256:image',
        jobRef: { kind: 'generation', jobId: 'job-image' },
        phase: 'outcome-unknown',
        createdAt: 3_000,
        updatedAt: 304_000,
        diagnostic: {
          code: 'generation-outcome-unknown',
          message: 'The provider outcome is unknown.',
        },
      }),
    );

    const empty = container.querySelector('.canvas-generation-node__empty');
    expect(empty?.parentElement?.classList.contains('canvas-generation-node__result-stack')).toBe(
      true,
    );
    expect(
      empty?.parentElement?.classList.contains('canvas-generation-node__result-stack--pending'),
    ).toBe(false);
    expect(container.querySelector('.canvas-generation-node__result-grid')).toBeNull();
    expect(container.querySelector('[data-generation-phase="outcome-unknown"]')).not.toBeNull();
  });

  it.each([
    ['prompt', 'text', 'Text', 'codicon-file-text'],
    ['image', 'image', 'Image', 'codicon-file-media'],
    ['audio', 'audio', 'Audio', 'codicon-music'],
    ['video', 'video', 'Video', 'codicon-play'],
  ] as const)(
    'renders the %s empty state as a %s content node',
    (kind, contentKind, label, iconClass) => {
      const node: GenerationCanvasNode = {
        id: `generation-${kind}`,
        type: 'generation',
        position: { x: 20, y: 30 },
        size: { width: 320, height: 240 },
        zIndex: 1,
        data: { recipe: { kind, prompt: '' }, outputs: [] },
      };

      render(node, createHost());

      expect(container.querySelector(`[data-canvas-content-kind="${contentKind}"]`)).not.toBeNull();
      expect(container.querySelector('.canvas-generation-node-frame')).not.toBeNull();
      expect(container.querySelector('.node-card--opaque')).not.toBeNull();
      const externalLabel = container.querySelector('[data-canvas-node-label]');
      expect(externalLabel?.textContent).toBe(label);
      expect(externalLabel?.closest('.node-card')).toBeNull();
      const empty = container.querySelector('.canvas-generation-node__empty');
      expect(empty).not.toBeNull();
      expect(empty?.querySelector(`.${iconClass}`)).not.toBeNull();
      expect(container.textContent).toContain(label);
      expect(container.textContent).not.toContain('generation');
    },
  );

  it('presents one input and one output handle without media-specific port fan-out', () => {
    render(imageNodeWithBatch(), createHost());

    const handles = container.querySelectorAll('[data-canvas-port-direction]');
    expect(handles).toHaveLength(2);
    expect(
      Array.from(handles).map((handle) => handle.getAttribute('data-canvas-port-direction')),
    ).toEqual(['input', 'output']);
    expect(container.innerHTML).not.toContain('#f59e0b');
    expect(container.innerHTML).not.toContain('#8b5cf6');
  });

  function render(
    node: GenerationCanvasNode,
    host: CanvasWebviewHostPort,
    onFullscreenPreview?: (nodeId: string, outputId?: string) => void,
  ): void {
    act(() => {
      root.render(
        <CanvasHostProvider host={host}>
          <GenerationNode
            node={node}
            viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
            isSelected
            containerRef={{ current: container }}
            onFullscreenPreview={onFullscreenPreview}
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

function imageNodeWithBatch(count = 2): GenerationCanvasNode {
  const outputs = Array.from({ length: count }, (_, index) =>
    imageOutput(`image-output-${index + 1}`),
  );
  return {
    id: 'generation-image',
    type: 'generation',
    position: { x: 20, y: 30 },
    size: { width: 320, height: 240 },
    zIndex: 1,
    data: {
      recipe: { kind: 'image', prompt: 'Two quiet frames', count: 2 },
      outputs,
      selectedOutputId: outputs[outputs.length - 1]?.outputId,
    },
  };
}

function imageOutput(outputId: string) {
  return {
    outputId,
    jobRef: { kind: 'generation' as const, jobId: 'job-image' },
    locator: {
      file: {
        authority: 'workspace' as const,
        path: `neko/generated/image/${outputId}.png`,
      },
    },
    kind: 'image' as const,
    recipeInputFingerprint: 'sha256:image-recipe',
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
    authorGenerationText: async () => snapshot(),
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
      generationKinds: [],
      generationModels: [],
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
    authoringCapabilities: { sourceModes: [], generationKinds: [], generationModels: [] },
    generationNodes: [],
  };
}
