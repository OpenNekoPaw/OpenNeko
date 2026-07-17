// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
  type CanvasData,
  type CanvasNode,
} from '@neko/shared';
import { ContentOverlay } from './ContentOverlay';
import { useCanvasStore } from '../../stores/canvasStore';
import { buildCanvasNode } from '../../utils/nodeFactory';
import { setLocale } from '../../i18n';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('ContentOverlay', () => {
  let host: HTMLElement;
  let reactHost: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    reactHost = document.createElement('div');
    document.body.appendChild(reactHost);
    host = document.body;
    root = createRoot(reactHost);
    setLocale('en');
    useCanvasStore.setState({
      canvasData: null,
      selection: { nodeIds: [], connectionIds: [] },
      contentOverlayState: { visible: false, nodeId: null },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    reactHost.remove();
  });

  it('renders Markdown text as a formatted fullscreen document and keeps the resource title', () => {
    const node = {
      ...buildCanvasNode({
        type: 'text',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'text.basic',
        data: {
          title: 'production-notes.md',
          content: '# Production Notes\n\n- first\n- second',
          format: 'markdown',
        },
      }),
      id: 'markdown-fullscreen',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    expect(
      host.querySelector('[data-content-overlay-presentation="text-document"]'),
    ).not.toBeNull();
    expect(host.querySelector('[data-text-document-preview="markdown"]')).not.toBeNull();
    expect(host.querySelector('[data-text-document-preview="plain"]')).toBeNull();
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.querySelector('h1')?.textContent).toBe('Production Notes');
    expect(host.textContent).toContain('production-notes.md');
  });

  it('renders plain text literally and switches to explicit editing', () => {
    const node = {
      ...buildCanvasNode({
        type: 'text',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'text.basic',
        data: {
          content: '# Fountain-style literal\n\nINT. HALL - NIGHT',
          format: 'plain',
          provenance: { sourceName: 'scene.fountain', importMode: 'snapshot' },
        },
      }),
      id: 'plain-fullscreen',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    expect(host.querySelector('[data-text-document-preview="plain"]')?.textContent).toContain(
      '# Fountain-style literal',
    );
    expect(host.querySelector('h1')).toBeNull();
    expect(host.textContent).toContain('scene.fountain');

    const editButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Edit',
    );
    act(() => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editor = host.querySelector<HTMLTextAreaElement>('[data-text-document-editor="plain"]');
    expect(editor?.value).toContain('INT. HALL - NIGHT');
    act(() => {
      if (!editor) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(editor, 'EXT. ROOF - DAWN');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(
      (useCanvasStore.getState().canvasData?.nodes[0]?.data as Record<string, unknown>)['content'],
    ).toBe('EXT. ROOF - DAWN');
  });

  it('renders image media in a frameless viewer with bounded zoom controls and close action', () => {
    const onClose = vi.fn();
    const node = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'media.basic',
        data: {
          assetPath: 'assets/portrait.png',
          runtimeAssetPath: 'data:image/png;base64,portrait',
          mediaType: 'image',
          title: 'portrait.png',
        },
      }),
      id: 'media-fullscreen',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={onClose} />);
    });

    const viewer = host.querySelector<HTMLElement>(
      '[data-content-overlay-presentation="image-viewer"]',
    );
    expect(viewer).not.toBeNull();
    expect(viewer?.dataset.contentOverlayFrame).toBe('frameless');
    expect(viewer?.className).toContain('fixed inset-0');
    expect(host.querySelector('[data-content-overlay-header="true"]')).toBeNull();
    expect(host.querySelector('[data-visual-stage-overlay="true"]')).toBeNull();
    expect(host.querySelector('[data-image-viewer-zoom-controls="true"]')).not.toBeNull();
    expect(host.querySelector('[data-image-viewer-zoom-percent="100"]')?.textContent).toBe('100%');
    expect(host.querySelector('[data-preview-chrome="full-bleed"]')).not.toBeNull();
    const image = host.querySelector<HTMLImageElement>('[data-preview-surface="visual"] img');
    expect(image?.className).toContain('h-full max-h-full');
    expect(image?.className).not.toContain('max-h-[52vh]');

    const zoomIn = host.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    act(() => {
      zoomIn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('[data-image-viewer-zoom-percent="125"]')?.textContent).toBe('125%');
    const zoomLayer = host.querySelector<HTMLElement>('[data-image-viewer-zoom-layer="true"]');
    expect(zoomLayer?.className).toContain('flex');
    expect(zoomLayer?.className).toContain('flex-col');
    expect(zoomLayer?.style.transform).toBe('scale(1.25)');
    expect(
      host.querySelector<HTMLElement>('[data-image-viewer-zoom-stage="125"]')?.style.width,
    ).toBe('125%');

    const resetZoom = host.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    act(() => {
      resetZoom?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const zoomOut = host.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]');
    for (let step = 0; step < 3; step += 1) {
      act(() => {
        zoomOut?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    expect(host.querySelector('[data-image-viewer-zoom-percent="25"]')?.textContent).toBe('25%');
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')?.disabled).toBe(
      true,
    );

    act(() => {
      resetZoom?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    for (let step = 0; step < 12; step += 1) {
      act(() => {
        zoomIn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    expect(host.querySelector('[data-image-viewer-zoom-percent="400"]')?.textContent).toBe(
      '400%',
    );
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.disabled).toBe(
      true,
    );

    act(() => {
      host
        .querySelector<HTMLButtonElement>('[data-image-viewer-close="true"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps non-image media on the headered visual stage without image zoom controls', () => {
    const node = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'media.basic',
        data: {
          assetPath: 'assets/clip.mp4',
          mediaType: 'video',
          title: 'clip.mp4',
        },
      }),
      id: 'video-fullscreen',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    expect(host.querySelector('[data-content-overlay-presentation="visual-stage"]')).not.toBeNull();
    expect(host.querySelector('[data-visual-stage-overlay="true"]')).not.toBeNull();
    expect(host.querySelector('[data-content-overlay-header="true"]')).not.toBeNull();
    expect(host.querySelector('[data-image-viewer-zoom-controls="true"]')).toBeNull();
  });

  it('closes from Escape without persisting transient presentation state', () => {
    const onClose = vi.fn();
    const node = {
      ...buildCanvasNode({
        type: 'text',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'text.basic',
        data: { content: 'Close me', format: 'plain' },
      }),
      id: 'escape-fullscreen',
    } as CanvasNode;
    useCanvasStore.setState({ canvasData: createCanvasData([node]) });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={onClose} />);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('owns fullscreen content scrolling in the overlay body viewport', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 21,
          duration: 3,
          visualDescription: 'A dense shot with enough metadata to require scrolling.',
          characterAction: 'The creator-facing summary stays readable.',
          characters: [{ characterName: 'Lead', role: 'primary' }],
          dialogue: 'The useful content stays visible.',
          voiceOver: 'A concise note remains available.',
          soundCue: 'soft pulse',
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-scroll:video:prompt',
                blockKind: 'video',
                text: 'Semantic video prompt should stay in the creator surface.',
              },
            },
          },
          generationPrompt: 'Legacy prompt should stay migration-only.',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-overlay-scroll',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const scrollRegion = host.querySelector<HTMLElement>(
      '[data-content-overlay-scroll-region="true"]',
    );
    expect(scrollRegion).not.toBeNull();
    expect(reactHost.querySelector('[data-content-overlay-root="true"]')).toBeNull();
    expect(
      host.querySelector<HTMLElement>('[data-content-overlay-panel="true"]')?.style.zIndex,
    ).toBe('20001');
    expect(scrollRegion?.className).toContain('flex min-h-0 flex-1 flex-col overflow-auto');
    const shotOverlay = host.querySelector<HTMLElement>('[data-shot-creator-overlay="true"]');
    expect(shotOverlay).not.toBeNull();
    expect(shotOverlay?.className).toContain('max-w-[1440px]');
    expect(shotOverlay?.className).toContain('minmax(320px,0.9fr)');
    expect(host.querySelector('[data-shot-creator-summary="true"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-preview="true"]')).not.toBeNull();
    expect(host.querySelector('[data-content-block-id="shot-generated-preview"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-details="true"]')).toBeNull();
    expect(host.textContent).not.toContain('Edit details and advanced metadata');
    expect(host.textContent).toContain('Lead (primary)');
    expect(host.textContent).toContain('The useful content stays visible.');
    expect(host.querySelector('[data-shot-creator-prompt="true"]')).not.toBeNull();
    expect(
      host
        .querySelector('[data-shot-creator-prompt-source]')
        ?.getAttribute('data-shot-creator-prompt-source'),
    ).toBe('semantic-prompt-document');
    expect(host.textContent).toContain('Semantic document');
    expect(
      host.querySelector<HTMLTextAreaElement>('[data-shot-creator-prompt-block-input="video"]')
        ?.value,
    ).toBe('Semantic video prompt should stay in the creator surface.');
    expect(host.querySelector('[data-content-block-id="shot-visual-description"]')).toBeNull();
    expect(host.querySelector('[data-content-block-id="shot-generation-prompt"]')).toBeNull();
    expect(host.querySelector('[data-shot-creator-summary-item="visual-action"]')).toBeNull();
    expect(host.textContent).not.toContain(
      'A dense shot with enough metadata to require scrolling.',
    );
    expect(host.textContent).not.toContain('The creator-facing summary stays readable.');
  });

  it('shows an assembled prompt in the creator summary when no custom prompt is set', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 2,
          duration: 1,
          visualDescription: 'White title page with calligraphy.',
          characterAction: 'No character action.',
          characters: [],
          emotion: ['mysterious'],
          sceneTags: ['opening'],
          visualStyle: 'minimal ink',
          soundCue: 'soft ambient tone',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-overlay-assembled-prompt',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    expect(
      host
        .querySelector('[data-shot-creator-prompt-source]')
        ?.getAttribute('data-shot-creator-prompt-source'),
    ).toBe('assembled');
    expect(host.textContent).toContain('Assembled from fields');
    const videoPrompt = host.querySelector<HTMLTextAreaElement>(
      '[data-shot-creator-prompt-block-input="video"]',
    );
    expect(videoPrompt?.value).toContain('White title page with calligraphy.');
    expect(videoPrompt?.value).toContain('Style: minimal ink');
    expect(videoPrompt?.value).toContain('Sound: soft ambient tone');
  });

  it('keeps image prompt text out of the shot summary visual/action row', () => {
    const duplicatedPrompt =
      '图像编辑：以 P04#panel_1 为输入，保留左侧巨大垂直建筑、狭窄桥面、两名人物背影和黑白网点线稿。';
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 4,
          visualDescription: duplicatedPrompt,
          characterAction: duplicatedPrompt,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              imagePromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-no-duplicate:image:prompt',
                blockKind: 'image',
                text: duplicatedPrompt,
              },
            },
          },
        },
      }),
      id: 'shot-overlay-no-duplicate',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    expect(host.querySelector('[data-shot-creator-summary-item="visual-action"]')).toBeNull();
    const summaryText = Array.from(host.querySelectorAll('[data-shot-creator-summary-value]'))
      .map((value) => value.textContent ?? '')
      .join('\n');
    expect(summaryText).not.toContain(duplicatedPrompt);
    expect(
      host.querySelector<HTMLTextAreaElement>('[data-shot-creator-prompt-block-input="image"]')
        ?.value,
    ).toBe(duplicatedPrompt);
  });

  it('renders semantic prompt spans, alignment state, and prompt diagnostics', () => {
    const videoPromptText =
      'Rainy hallway Aki turns back with slow dolly-in, cinematic anime still using @RefFrame';
    const voicePromptText = 'tense whisper: Where are you?';
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 7,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-spans:video:prompt',
                blockKind: 'video',
                text: videoPromptText,
                spans: [
                  createPromptSpan(videoPromptText, 'Rainy hallway', 'scene', 'scene.location'),
                  createPromptSpan(videoPromptText, 'Aki', 'character', 'character.ref'),
                  createPromptSpan(videoPromptText, 'turns back', 'action', 'shot.action'),
                  createPromptSpan(videoPromptText, 'slow dolly-in', 'camera', 'camera.movement'),
                  createPromptSpan(videoPromptText, 'cinematic anime still', 'style', 'style.look'),
                  createPromptSpan(videoPromptText, '@RefFrame', 'resource', 'reference.media'),
                ],
                fieldProjections: [
                  {
                    fieldId: 'scene.videoPrompt',
                    value: videoPromptText,
                    alignmentState: 'in-sync',
                  },
                ],
              },
              voicePromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-spans:voice:prompt',
                blockKind: 'voice',
                text: voicePromptText,
                spans: [
                  createPromptSpan(voicePromptText, 'tense whisper', 'voice', 'voice.emotion'),
                ],
                fieldProjections: [
                  {
                    fieldId: 'voice.dialogue',
                    value: voicePromptText,
                    alignmentState: 'suggestion-pending',
                  },
                ],
              },
            },
            diagnostics: [
              {
                severity: 'warning',
                code: 'prompt-alignment-review',
                message: 'Review wet hair as character appearance.',
              },
            ],
          },
        },
      }),
      id: 'shot-overlay-spans',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const videoEditor = host.querySelector('[data-shot-creator-prompt-block-editor="video"]');
    const videoPromptDisplay = videoEditor?.querySelector('[data-semantic-prompt-text="true"]');
    expect(videoEditor).not.toBeNull();
    expect(videoPromptDisplay).not.toBeNull();
    expect(videoPromptDisplay?.getAttribute('data-semantic-prompt-visual-style')).toBe('subtle');
    expect(videoEditor?.querySelector('[data-semantic-prompt-span-kind="scene"]')).not.toBeNull();
    expect(
      videoEditor?.querySelector('[data-semantic-prompt-span-kind="character"]'),
    ).not.toBeNull();
    expect(videoEditor?.querySelector('[data-semantic-prompt-span-kind="action"]')).not.toBeNull();
    expect(videoEditor?.querySelector('[data-semantic-prompt-span-kind="camera"]')).not.toBeNull();
    expect(videoEditor?.querySelector('[data-semantic-prompt-span-kind="style"]')).not.toBeNull();
    expect(
      videoEditor?.querySelector('[data-semantic-prompt-span-kind="resource"]'),
    ).not.toBeNull();
    expect(videoEditor?.querySelector('[data-semantic-prompt-span-kind="voice"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-prompt-block-editor="voice"]')).toBeNull();
    expect(host.textContent).not.toContain('Voice prompt');
    const semanticPromptSpans = Array.from(
      videoEditor?.querySelectorAll('[data-semantic-prompt-span-kind]') ?? [],
    );
    expect(semanticPromptSpans.length).toBeGreaterThan(0);
    for (const span of semanticPromptSpans) {
      expect(span.className).toContain('text-current');
      expect(span.className).toContain('underline');
      expect(span.className).not.toContain('text-emerald-800');
      expect(span.className).not.toContain('text-cyan-800');
      expect(span.className).not.toContain('text-amber-800');
    }
    expect(videoEditor?.textContent).toContain(videoPromptText);
    expect(videoEditor?.textContent).toContain(voicePromptText);
    expect(
      videoEditor?.querySelector<HTMLTextAreaElement>(
        '[data-shot-creator-prompt-block-input="video"]',
      )?.value,
    ).toBe(`${videoPromptText}\n\n${voicePromptText}`);
    expect(
      videoEditor?.querySelector('[data-semantic-prompt-span-kind="scene"]')?.getAttribute('title'),
    ).toContain('Scene location');
    expect(host.querySelector(`[aria-label="Semantic prompt spans"]`)).toBeNull();
    expect(
      host.querySelector('[data-shot-creator-prompt-alignment-state="in-sync"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-shot-creator-prompt-alignment-state="suggestion-pending"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-shot-creator-prompt-diagnostic="prompt-alignment-review"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain('Scene video prompt: In sync');
    expect(host.textContent).toContain('Dialogue: Suggestion pending');
    expect(host.textContent).toContain('Review wet hair as character appearance.');
  });

  it('absorbs existing voice prompt text into the video prompt when edited', async () => {
    const videoPromptText = 'Camera follows Ren across the rain-slick alley.';
    const voicePromptText = 'Ren whispers: Stay close.';
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 12,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-absorb-voice:video:prompt',
                blockKind: 'video',
                text: videoPromptText,
              },
              voicePromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-absorb-voice:voice:prompt',
                blockKind: 'voice',
                text: voicePromptText,
              },
            },
          },
        },
      }),
      id: 'shot-overlay-absorb-voice',
    } as CanvasNode;
    const updateNodeData = vi.fn();
    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
      updateNodeData,
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const textarea = host.querySelector<HTMLTextAreaElement>(
      '[data-shot-creator-prompt-block-input="video"]',
    );
    expect(textarea?.value).toBe(`${videoPromptText}\n\n${voicePromptText}`);

    await act(async () => {
      setTextareaValue(textarea!, `${videoPromptText}\n\n${voicePromptText}\nHold on their hands.`);
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      textarea!.dispatchEvent(new Event('focusout', { bubbles: true }));
    });

    const payload = updateNodeData.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    const promptBlocks = readRecord(readRecord(payload?.storyboardPrompt)?.promptBlocks);
    expect(readRecord(promptBlocks?.videoPromptDocument)?.text).toContain(voicePromptText);
    expect(promptBlocks).not.toHaveProperty('voicePromptDocument');
  });

  it('renders capability-driven storyboard parameters in shot prompt details', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 8,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-advanced:video:prompt',
                blockKind: 'video',
                text: 'Generate a careful slow push-in.',
              },
            },
            referenceMedia: {
              imageRefs: [],
              videoRefs: [
                {
                  refId: 'ref-video',
                  role: 'reference',
                  locator: {
                    type: 'asset',
                    assetId: 'ref-video',
                    uri: 'assets/ref-video.mp4',
                  },
                  mimeType: 'video/mp4',
                },
              ],
              audioRefs: [
                {
                  refId: 'ref-audio',
                  role: 'reference',
                  locator: {
                    type: 'asset',
                    assetId: 'ref-audio',
                    uri: 'assets/ref-audio.wav',
                  },
                  mimeType: 'audio/wav',
                },
              ],
            },
            generationParams: {
              duration: 4,
              aspectRatio: '16:9',
              advancedParameters: {
                seed: 1234,
                negativePrompt: 'blur',
                motionStrength: 0.6,
              },
            },
          },
        },
      }),
      id: 'shot-overlay-advanced',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    expect(host.querySelector('[data-shot-creator-advanced-params="true"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-advanced-param="seed"]')).not.toBeNull();
    expect(
      host.querySelector('[data-shot-creator-advanced-param="negativePrompt"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-shot-creator-advanced-param="motionStrength"]'),
    ).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-advanced-param="aspectRatio"]')).not.toBeNull();
    expect(
      host.querySelector('[data-shot-creator-advanced-param="videoReference"]'),
    ).not.toBeNull();
    expect(
      host.querySelector('[data-shot-creator-advanced-param="audioReference"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain('Advanced parameters');
    expect(host.textContent).toContain('Seed: 1234');
    expect(host.textContent).toContain('Negative prompt: blur');
  });

  it('localizes semantic prompt inline spans and advanced parameter labels in Chinese', () => {
    setLocale('zh-cn');
    const videoPromptText = 'rainy school hallway, Aki turns back, slow dolly-in';
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 9,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-zh-labels:video:prompt',
                blockKind: 'video',
                text: videoPromptText,
                spans: [
                  createPromptSpan(videoPromptText, 'slow dolly-in', 'camera', 'camera.movement'),
                  createPromptSpan(videoPromptText, 'Aki turns back', 'action', 'shot.action'),
                ],
                fieldProjections: [
                  {
                    fieldId: 'camera.movement',
                    value: 'slow dolly-in',
                    alignmentState: 'in-sync',
                  },
                  {
                    fieldId: 'shot.action',
                    value: 'Aki turns back',
                    alignmentState: 'in-sync',
                  },
                ],
              },
            },
            generationParams: {
              duration: 4,
              aspectRatio: '16:9',
              advancedParameters: {
                negativePrompt: 'low quality',
                motionStrength: 0.55,
              },
            },
          },
        },
      }),
      id: 'shot-overlay-zh-labels',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const cameraSpan = host.querySelector('[data-semantic-prompt-span-kind="camera"]');
    const actionSpan = host.querySelector('[data-semantic-prompt-span-kind="action"]');
    expect(cameraSpan?.textContent).toBe('slow dolly-in');
    expect(cameraSpan?.getAttribute('title')).toContain('运镜');
    expect(actionSpan?.textContent).toBe('Aki turns back');
    expect(actionSpan?.getAttribute('title')).toContain('动作');
    const text = host.textContent ?? '';
    expect(text).toContain('镜头动作: 已同步');
    expect(text).toContain('负向提示词: low quality');
    expect(text).toContain('运动强度: 0.55');
    expect(text).toContain('画幅比例: 16:9');
    expect(text).not.toContain('camera.movement: in-sync');
    expect(text).not.toContain('shot.action: in-sync');
    expect(text).not.toContain('negativePrompt: low quality');
    expect(text).not.toContain('motionStrength: 0.55');
  });

  it('renders markdown inline tokens and keyboard isolation through the prompt editor adapter', () => {
    const promptText = '**Rainy hallway** uses `slow dolly` with ![[ref/frame]] and @Aki';
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 11,
          visualDescription: '**Rainy hallway** with ![[ref/frame]]',
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-markdown-editor:video:prompt',
                blockKind: 'video',
                text: promptText,
              },
            },
          },
        },
      }),
      id: 'shot-overlay-markdown-editor',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const editor = host.querySelector('[data-shot-creator-prompt-block-editor="video"]');
    const textarea = editor?.querySelector<HTMLTextAreaElement>(
      '[data-shot-creator-prompt-block-input="video"]',
    );

    expect(editor?.querySelector('[data-inline-markdown-highlight="true"]')).not.toBeNull();
    expect(editor?.querySelector('[data-markdown-inline-strong="true"]')).not.toBeNull();
    expect(editor?.querySelector('[data-markdown-inline-code="true"]')).not.toBeNull();
    expect(editor?.querySelector('[data-markdown-resource-reference="true"]')).not.toBeNull();
    expect(editor?.querySelector('[data-markdown-mention="true"]')).not.toBeNull();
    expect(editor?.querySelector('[data-markdown-generation-prompt-parts="true"]')).not.toBeNull();
    expect(editor?.querySelector('[data-inline-markdown-highlight="true"]')?.textContent).toContain(
      'Rainy hallway',
    );
    expect(textarea?.getAttribute('placeholder')).toBeNull();
    expect(textarea?.getAttribute('aria-label')).toBe('Scene video prompt');
    expect(textarea?.rows).toBe(10);
    expect(textarea?.className).toContain('min-h-[14rem]');
    expect(textarea?.getAttribute('data-neko-keyboard-scope')).toBe('text-input');
    expect(textarea?.getAttribute('data-neko-keyboard-owner')).toBe(
      'shot-creator-prompt:shot-overlay-markdown-editor:video',
    );
    expect(textarea?.getAttribute('data-neko-keyboard-owned-keys')).toContain('Enter');
    const imageTextarea = host.querySelector<HTMLTextAreaElement>(
      '[data-shot-creator-prompt-block-input="image"]',
    );
    expect(imageTextarea?.getAttribute('placeholder')).toBeNull();
    expect(imageTextarea?.rows).toBe(10);
    expect(imageTextarea?.className).toContain('min-h-[14rem]');
    expect(host.querySelector('[data-shot-creator-summary-item="visual-action"]')).toBeNull();
  });

  it('renders prompt action buttons and generation prompt parts in shot prompt editors', () => {
    const promptText = '图像编辑：以 P04#panel_1 为输入，裁切为竖幅，保持人物比例';
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 13,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              imagePromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-actions:image:prompt',
                blockKind: 'image',
                text: promptText,
              },
            },
          },
        },
      }),
      id: 'shot-overlay-actions',
    } as CanvasNode;
    const onOptimizePrompt = vi.fn();
    const onGenerateImage = vi.fn();
    const onEditImage = vi.fn();
    const onGenerateVideo = vi.fn();
    const onEditVideo = vi.fn();

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(
        <ContentOverlay
          nodeId={node.id}
          onClose={() => undefined}
          onOptimizePrompt={onOptimizePrompt}
          onGenerateImage={onGenerateImage}
          onEditImage={onEditImage}
          onGenerateVideo={onGenerateVideo}
          onEditVideo={onEditVideo}
        />,
      );
    });

    const optimize = host.querySelector<HTMLButtonElement>(
      '[data-shot-creator-prompt-action="optimize-video-prompt"]',
    );
    const generateImage = host.querySelector<HTMLButtonElement>(
      '[data-shot-creator-prompt-action="generate-image"]',
    );
    const editImage = host.querySelector<HTMLButtonElement>(
      '[data-shot-creator-prompt-action="edit-image"]',
    );
    const generateVideo = host.querySelector<HTMLButtonElement>(
      '[data-shot-creator-prompt-action="generate-video"]',
    );
    const editVideo = host.querySelector<HTMLButtonElement>(
      '[data-shot-creator-prompt-action="edit-video"]',
    );
    const videoActionGroup = host.querySelector('[data-shot-creator-prompt-action-group="video"]');
    const imageActionGroup = host.querySelector('[data-shot-creator-prompt-action-group="image"]');
    expect(videoActionGroup).not.toBeNull();
    expect(imageActionGroup).not.toBeNull();
    expect(
      videoActionGroup?.querySelector('[data-shot-creator-prompt-action="optimize-video-prompt"]'),
    ).not.toBeNull();
    expect(
      videoActionGroup?.querySelector('[data-shot-creator-prompt-action="generate-video"]'),
    ).not.toBeNull();
    expect(
      videoActionGroup?.querySelector('[data-shot-creator-prompt-action="edit-video"]'),
    ).not.toBeNull();
    expect(
      videoActionGroup?.querySelector('[data-shot-creator-prompt-action="generate-image"]'),
    ).toBeNull();
    expect(
      imageActionGroup?.querySelector('[data-shot-creator-prompt-action="generate-image"]'),
    ).not.toBeNull();
    expect(
      imageActionGroup?.querySelector('[data-shot-creator-prompt-action="edit-image"]'),
    ).not.toBeNull();
    expect(
      imageActionGroup?.querySelector('[data-shot-creator-prompt-action="generate-video"]'),
    ).toBeNull();
    expect(optimize?.textContent).toContain('Optimize prompt');
    expect(generateImage?.textContent).toContain('Generate image');
    expect(editImage?.textContent).toContain('Edit image');
    expect(generateVideo?.textContent).toContain('Generate video');
    expect(editVideo?.textContent).toContain('Edit video');
    expect(optimize?.disabled).toBe(false);
    expect(generateImage?.disabled).toBe(false);
    expect(editImage?.disabled).toBe(false);
    expect(generateVideo?.disabled).toBe(false);
    expect(editVideo?.disabled).toBe(false);

    act(() => {
      optimize?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      generateImage?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      editImage?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      generateVideo?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      editVideo?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOptimizePrompt).toHaveBeenCalledWith(node.id);
    expect(onGenerateImage).toHaveBeenCalledWith(node.id);
    expect(onEditImage).toHaveBeenCalledWith(node.id);
    expect(onGenerateVideo).toHaveBeenCalledWith(node.id);
    expect(onEditVideo).toHaveBeenCalledWith(node.id);
    const imageEditor = host.querySelector('[data-shot-creator-prompt-block-editor="image"]');
    expect(
      imageEditor?.querySelector('[data-markdown-generation-prompt-parts="true"]'),
    ).not.toBeNull();
    expect(
      imageEditor?.querySelector('[data-markdown-generation-prompt-part-kind="intent"]'),
    ).not.toBeNull();
  });

  it('renders typed creative AI action status and aggregate progress from Agent snapshots', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 7,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-ai-status:video:prompt',
                blockKind: 'video',
                text: 'Hold a slow push-in while dialogue stays in frame.',
              },
            },
          },
        },
      }),
      id: 'shot-overlay-ai-status',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(
        <ContentOverlay
          nodeId={node.id}
          onClose={() => undefined}
          creativeAiStatus={{
            status: 'accepted',
            actionId: 'generate-video',
            diagnostics: [
              {
                severity: 'warning',
                code: 'canvas-creative-ai-model-capability-unsupported',
                message: 'Selected model does not support video generation.',
              },
            ],
            snapshot: {
              aggregate: {
                totalCount: 3,
                completedCount: 1,
                failedCount: 1,
                runningCount: 1,
                queuedCount: 0,
              },
            },
          }}
        />,
      );
    });

    expect(host.querySelector('[data-shot-creator-ai-status="accepted"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-ai-action-id="generate-video"]')).not.toBeNull();
    expect(host.querySelector('[data-shot-creator-ai-aggregate="true"]')?.textContent).toContain(
      'Progress 1/3',
    );
    expect(
      host.querySelector(
        '[data-shot-creator-ai-diagnostic="canvas-creative-ai-model-capability-unsupported"]',
      )?.textContent,
    ).toContain('Selected model does not support video generation.');
  });

  it('renders candidate-first AI results and candidate action controls', () => {
    const nodeId = 'shot-overlay-ai-candidate';
    const targetRef = {
      kind: 'canvas-field',
      packageId: 'neko-canvas',
      id: `canvas-node:${nodeId}#/generatedAsset`,
      entityId: nodeId,
      fieldPath: '/generatedAsset',
      metadata: { actionId: 'generate-image' },
    };
    const candidateTargetRef = {
      kind: 'candidate-target',
      packageId: 'neko-canvas',
      id: `canvas-node:${nodeId}#candidate:generate-image`,
      entityId: nodeId,
      fieldPath: '/storyboardPrompt/candidates/generate-image',
      candidateOnly: true,
      metadata: { actionId: 'generate-image' },
    };
    const baseNode = buildCanvasNode({
      type: 'shot',
      position: { x: 0, y: 0 },
      zIndex: 0,
      preset: 'shot.basic',
      data: {
        shotNumber: 10,
        storyboardPrompt: {
          version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
          promptBlocks: {
            imagePromptDocument: {
              version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
              documentId: `${nodeId}:image:prompt`,
              blockKind: 'image',
              text: 'Generate a clean keyframe.',
            },
          },
        },
      },
    });
    const node = {
      ...baseNode,
      id: nodeId,
      data: {
        ...baseNode.data,
        creativeAiCandidates: {
          [candidateTargetRef.id]: {
            candidateId: candidateTargetRef.id,
            status: 'candidate',
            sourcePackage: 'neko-canvas',
            targetRef,
            candidateTargetRef,
            outputRefs: [
              {
                kind: 'generated-asset',
                id: 'candidate-output-1',
                generatedAssetId: 'image/shot-10.png',
                mimeType: 'image/png',
              },
            ],
            targetRevision: 'target-revision-1',
            candidateRevision: 'candidate-revision-1',
            runId: 'creative-run-1',
            conversationId: 'creative-session-1',
            idempotencyKey: 'candidate-idempotency-1',
            createdAt: '2026-07-10T00:00:00.000Z',
          },
        },
      },
    } as CanvasNode;
    const onCandidateAccept = vi.fn();
    const onCandidateReject = vi.fn();
    const onCandidateRetry = vi.fn();
    const onCandidateDelete = vi.fn();
    const onCandidateInspect = vi.fn();

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(
        <ContentOverlay
          nodeId={node.id}
          onClose={() => undefined}
          onCandidateAccept={onCandidateAccept}
          onCandidateReject={onCandidateReject}
          onCandidateRetry={onCandidateRetry}
          onCandidateDelete={onCandidateDelete}
          onCandidateInspect={onCandidateInspect}
        />,
      );
    });

    expect(host.querySelector('[data-shot-creator-ai-candidates="true"]')).not.toBeNull();
    expect(
      host.querySelector(`[data-shot-creator-ai-candidate="${candidateTargetRef.id}"]`),
    ).not.toBeNull();
    expect(host.textContent).toContain('Creative AI candidates');
    expect(host.textContent).toContain('Generate image');
    expect(host.textContent).toContain('Resource: generated-assets/image/shot-10.png');

    for (const action of ['accept', 'reject', 'retry', 'delete', 'inspect']) {
      const button = host.querySelector<HTMLButtonElement>(
        `[data-shot-creator-ai-candidate-action="${action}"]`,
      );
      expect(button?.disabled).toBe(false);
      act(() => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    expect(onCandidateAccept).toHaveBeenCalledWith(
      node.id,
      candidateTargetRef.id,
      'generate-image',
    );
    expect(onCandidateReject).toHaveBeenCalledWith(
      node.id,
      candidateTargetRef.id,
      'generate-image',
    );
    expect(onCandidateRetry).toHaveBeenCalledWith(node.id, candidateTargetRef.id, 'generate-image');
    expect(onCandidateDelete).toHaveBeenCalledWith(
      node.id,
      candidateTargetRef.id,
      'generate-image',
    );
    expect(onCandidateInspect).toHaveBeenCalledWith(
      node.id,
      candidateTargetRef.id,
      'generate-image',
    );
  });

  it('renders local diagnostics for missing prompt and edit source parameters', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 14,
        },
      }),
      id: 'shot-overlay-ai-action-diagnostics',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    expect(
      host.querySelector(
        '[data-shot-creator-ai-action-diagnostic="canvas-creative-ai-image-prompt-empty"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector(
        '[data-shot-creator-ai-action-diagnostic="canvas-creative-ai-video-prompt-empty"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector(
        '[data-shot-creator-ai-action-diagnostic="canvas-creative-ai-image-edit-source-missing"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector(
        '[data-shot-creator-ai-action-diagnostic="canvas-creative-ai-video-edit-source-missing"]',
      ),
    ).not.toBeNull();
  });

  it('commits prompt edits as semantic storyboardPrompt and cancels Escape edits', async () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 3,
          visualDescription: 'Field assembled prompt.',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-overlay-edit-prompt',
    } as CanvasNode;

    const updateNodeData = vi.fn();
    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
      updateNodeData,
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const textarea = host.querySelector<HTMLTextAreaElement>(
      '[data-shot-creator-prompt-block-input="video"]',
    );
    expect(textarea).not.toBeNull();

    await act(async () => {
      setTextareaValue(textarea!, 'Custom title prompt');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      textarea!.dispatchEvent(new Event('focusout', { bubbles: true }));
    });

    expect(updateNodeData).toHaveBeenCalledWith(node.id, {
      storyboardPrompt: expect.objectContaining({
        version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
        promptBlocks: expect.objectContaining({
          videoPromptDocument: expect.objectContaining({
            version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
            documentId: 'shot-overlay-edit-prompt:video:prompt',
            blockKind: 'video',
            text: 'Custom title prompt',
            userOverride: true,
          }),
        }),
      }),
    });
    const payload = updateNodeData.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(payload).not.toHaveProperty('generationPrompt');

    updateNodeData.mockClear();

    await act(async () => {
      setTextareaValue(textarea!, 'Should not commit');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      textarea!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      textarea!.dispatchEvent(new Event('focusout', { bubbles: true }));
    });

    expect(updateNodeData).not.toHaveBeenCalled();
  });

  it('synchronizes tagged span edits into field projections', async () => {
    const promptText = 'Rainy hallway, Aki turns back.';
    const sceneSpan = createPromptSpan(promptText, 'Rainy hallway', 'scene', 'scene.location');
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 4,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-tagged-edit:video:prompt',
                blockKind: 'video',
                text: promptText,
                spans: [sceneSpan],
                fieldProjections: [
                  {
                    fieldId: 'scene.location',
                    value: 'Rainy hallway',
                    sourceSpanId: sceneSpan.id,
                    alignmentState: 'in-sync',
                  },
                ],
              },
            },
          },
        },
      }),
      id: 'shot-overlay-tagged-edit',
    } as CanvasNode;

    const updateNodeData = vi.fn();
    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
      updateNodeData,
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const textarea = host.querySelector<HTMLTextAreaElement>(
      '[data-shot-creator-prompt-block-input="video"]',
    );
    expect(textarea).not.toBeNull();

    await act(async () => {
      setTextareaValue(textarea!, 'Sunset rooftop, Aki turns back.');
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      textarea!.dispatchEvent(new Event('focusout', { bubbles: true }));
    });

    const payload = updateNodeData.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    const document = readPromptDocumentFromUpdate(payload, 'videoPromptDocument');
    expect(document).toMatchObject({
      text: 'Sunset rooftop, Aki turns back.',
      userOverride: false,
      fieldProjections: [
        expect.objectContaining({
          fieldId: 'scene.location',
          value: 'Sunset rooftop',
          alignmentState: 'in-sync',
          userOverride: false,
        }),
      ],
    });
    expect(readArray(document?.spans)?.[0]).toMatchObject({
      range: { start: 0, end: 'Sunset rooftop'.length },
      source: 'user',
    });
    expect(readArray(readRecord(payload?.storyboardPrompt)?.diagnostics) ?? []).toEqual([]);
  });

  it('preserves free-form prompt edits as suggestions with alignment diagnostics', async () => {
    const promptText = 'Rainy hallway, Aki turns back.';
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 5,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-freeform-edit:video:prompt',
                blockKind: 'video',
                text: promptText,
                spans: [createPromptSpan(promptText, 'Rainy hallway', 'scene', 'scene.location')],
              },
            },
          },
        },
      }),
      id: 'shot-overlay-freeform-edit',
    } as CanvasNode;

    const updateNodeData = vi.fn();
    useCanvasStore.setState({
      canvasData: createCanvasData([node]),
      selection: { nodeIds: [node.id], connectionIds: [] },
      updateNodeData,
    });

    act(() => {
      root.render(<ContentOverlay nodeId={node.id} onClose={() => undefined} />);
    });

    const textarea = host.querySelector<HTMLTextAreaElement>(
      '[data-shot-creator-prompt-block-input="video"]',
    );
    expect(textarea).not.toBeNull();

    await act(async () => {
      setTextareaValue(textarea!, `${promptText} Wet hair catches the cold light.`);
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      textarea!.dispatchEvent(new Event('focusout', { bubbles: true }));
    });

    const payload = updateNodeData.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    const document = readPromptDocumentFromUpdate(payload, 'videoPromptDocument');
    expect(document).toMatchObject({
      text: `${promptText} Wet hair catches the cold light.`,
      userOverride: true,
      fieldProjections: [
        expect.objectContaining({
          fieldId: 'scene.videoPrompt',
          alignmentState: 'prompt-overridden',
          userOverride: true,
        }),
      ],
      fieldSuggestions: [
        expect.objectContaining({
          fieldId: 'scene.videoPrompt',
          suggestedValue: `${promptText} Wet hair catches the cold light.`,
        }),
      ],
    });
    expect(readArray(readRecord(payload?.storyboardPrompt)?.diagnostics)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'semantic-prompt-freeform-edit',
        target: '/storyboardPrompt/promptBlocks/videoPromptDocument',
      }),
    ]);
  });

  it('keeps scene storyboard table visible in fullscreen overlay', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneNumber: 5, sceneTitle: 'Fullscreen Scene' },
      }),
      id: 'scene-overlay-table',
      container: { policy: 'scene', childIds: ['shot-overlay-row'] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 1,
          visualDescription: 'Visible fullscreen shot row',
          dialogue: 'The table is still here.',
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              imagePromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-row:image:prompt',
                blockKind: 'image',
                text: 'Use the imported reference frame.',
              },
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-overlay-row:video:prompt',
                blockKind: 'video',
                text: 'Visible fullscreen video prompt',
              },
            },
          },
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-overlay-row',
      parentId: 'scene-overlay-table',
    } as CanvasNode;

    useCanvasStore.setState({
      canvasData: createCanvasData([scene, shot]),
      selection: { nodeIds: [scene.id], connectionIds: [] },
    });

    act(() => {
      root.render(<ContentOverlay nodeId={scene.id} onClose={() => undefined} />);
    });

    expect(
      host
        .querySelector('[data-container-section-id="scene-root"]')
        ?.getAttribute('data-container-section-fill'),
    ).toBe('fill');
    expect(host.querySelector('[data-scene-shot-table="true"]')).not.toBeNull();
    expect(host.querySelector('[data-scene-shot-table-row-id="shot-overlay-row"]')).not.toBeNull();
    expect(host.querySelector('[data-scene-shot-table-column="video-prompt"]')).toBeNull();
    expect(host.textContent).toContain('Use the imported reference frame.');
    expect(host.textContent).toContain('The table is still here.');
    expect(host.textContent).toContain('Generate reference image');
    expect(host.textContent).toContain('Generate image');
  });
});

function createCanvasData(nodes: CanvasNode[]): CanvasData {
  return {
    version: '2.1',
    name: 'Test Canvas',
    nodes,
    connections: [],
  };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
}

function readPromptDocumentFromUpdate(
  payload: Record<string, unknown> | undefined,
  key: 'imagePromptDocument' | 'videoPromptDocument' | 'voicePromptDocument',
): Record<string, unknown> | undefined {
  const promptState = readRecord(payload?.storyboardPrompt);
  const promptBlocks = readRecord(promptState?.promptBlocks);
  return readRecord(promptBlocks?.[key]);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readArray(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function createPromptSpan(
  text: string,
  value: string,
  kind: string,
  fieldId: string,
): {
  readonly id: string;
  readonly kind: string;
  readonly range: { readonly start: number; readonly end: number };
  readonly fieldId: string;
  readonly source: 'agent';
} {
  const start = text.indexOf(value);
  if (start < 0) {
    throw new Error(`Prompt span value not found: ${value}`);
  }
  return {
    id: `${kind}:${fieldId}`,
    kind,
    range: { start, end: start + value.length },
    fieldId,
    source: 'agent',
  };
}
