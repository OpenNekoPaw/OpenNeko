import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
  createResourceRef,
  type AnnotationCanvasNode,
  type CanvasNode,
  type CanvasStoryboardActionIntentId,
  type CanvasStoryboardNextCreativeStateTarget,
  type CanvasViewport,
  type TextCanvasNode,
} from '@neko/shared';
import { ContainerRenderer } from './ContainerRenderer';
import { createNodeCollapseUpdate, NodeContentDispatcher } from './NodeContentDispatcher';
import {
  filterSceneShotTableRows,
  projectSceneShotTableRows,
  resolveSceneShotTableColumns,
} from './creatorPresentation';
import { resolveShotPreviewSource, resolveShotReviewPreviewSource } from './node-card';
import type { NodeContentRenderContext } from './types';
import type { NodeRendererContext } from '../nodes/nodeRendererTypes';
import { buildCanvasNode } from '../../utils/nodeFactory';
import { setLocale } from '../../i18n';

(globalThis as { React?: typeof React }).React = React;

const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };
const imagePrepPlan = {
  schemaVersion: 1,
  kind: 'shot-image-prep-plan',
  planId: 'shot-a-image-prep',
  sceneId: 'scene-projection',
  shotId: 'shot-a',
  sourceMediaRefs: [],
  imageStrategy: 'transform-original',
  operationPlan: ['rotate', 'split-panels', 'colorize'],
  status: 'planned',
  metadata: {
    regenerationRecommendation: {
      decision: 'transform-source',
      label: 'Transform source',
      reason: 'Panel needs preparation before animation.',
    },
    imageAudit: {
      orientation: 'rotate-90',
      panelCount: 3,
      derivedShotCount: 2,
      requiresSplit: true,
    },
  },
};

function createContext(node: CanvasNode, allNodes: CanvasNode[] = [node]): NodeRendererContext {
  return {
    node,
    allNodes,
    selectedNodeIds: [],
    viewport,
    isSelected: false,
    containerRef: { current: null },
  };
}

function createAnnotationNode(): AnnotationCanvasNode {
  return {
    id: 'annotation-1',
    type: 'annotation',
    position: { x: 0, y: 0 },
    size: { width: 220, height: 120 },
    zIndex: 1,
    data: { content: 'Legacy note' },
  };
}

afterEach(() => {
  setLocale('en');
});

describe('NodeContentDispatcher', () => {
  it('renders foundational media as a full-bleed resource with descriptor-owned fullscreen', () => {
    const resourceRef = createResourceRef({
      id: 'resource-cover',
      scope: 'project',
      provider: 'workspace',
      kind: 'media',
      source: {
        kind: 'file',
        projectRelativePath: 'assets/covers/BLAME-01.png',
      },
      locator: { kind: 'file', path: 'assets/covers/BLAME-01.png' },
      fingerprint: { strategy: 'identity', value: 'cover-v1' },
    });
    const node: CanvasNode = {
      id: 'media-foundational',
      type: 'media',
      preset: 'media.basic',
      position: { x: 0, y: 0 },
      size: { width: 280, height: 420 },
      zIndex: 1,
      data: {
        mediaType: 'image',
        runtimeAssetPath: 'data:image/png;base64,cover',
        resourceRef,
      },
      preview: {
        title: 'Media',
        role: 'image',
      },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('BLAME-01.png');
    expect(readClassName(markup, 'data-container-section-id', 'media-root')).not.toContain('p-2');
    expect(readClassName(markup, 'data-container-section-id', 'media-preview')).not.toContain(
      'p-2',
    );
    expect(readClassName(markup, 'data-content-block-id', 'media-asset-preview')).toContain(
      'flex-1',
    );
    expect(readClassName(markup, 'data-preview-surface', 'visual')).not.toContain('border');
    expect(markup).toContain('object-contain');
    expect(markup).not.toContain('object-cover');
    expect(markup).toContain('aria-label="Fullscreen"');
    expect(markup.match(/<button/g)).toHaveLength(4);
  });

  it('uses the default renderer when node has no content and no preset', () => {
    const node: CanvasNode = {
      id: 'storyboard-1',
      type: 'storyboard',
      position: { x: 0, y: 0 },
      size: { width: 300, height: 200 },
      zIndex: 1,
      data: {},
    } as CanvasNode;
    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () =>
          React.createElement('div', { className: 'default-node' }, 'Default path'),
      }),
    );

    expect(markup).toContain('Default path');
    expect(markup).toContain('default-node');
  });

  it('uses composable content when node.content exists and no preset matches', () => {
    const node = {
      id: 'custom-1',
      type: 'document',
      position: { x: 0, y: 0 },
      size: { width: 220, height: 120 },
      zIndex: 1,
      data: { title: 'My Doc' },
      content: {
        id: 'root',
        blocks: [
          {
            id: 'body',
            kind: 'text',
            binding: { path: '/title' },
          },
        ],
      },
    } as unknown as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('My Doc');
    expect(markup).not.toContain('Default path');
    expect(markup).toContain('data-content-block-id="body"');
  });

  it('matches the annotation.basic composable rollout snapshot', () => {
    const node: AnnotationCanvasNode = {
      ...createAnnotationNode(),
      preset: 'annotation.basic',
      content: {
        id: 'annotation-root',
        layout: 'stack',
        blocks: [
          {
            id: 'annotation-content',
            kind: 'textarea',
            label: 'Note',
            binding: { path: '/content', valueType: 'string' },
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-node-density="compact"');
    expect(markup).toContain('data-node-overflow="scroll"');
    expect(markup).toContain('flex-1 resize-none');
    expect(markup).toContain('<textarea');
  });

  it('renders Markdown text as content on Canvas and keeps the textarea in the edit overlay', () => {
    const node: TextCanvasNode = {
      id: 'text-markdown',
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 360, height: 240 },
      zIndex: 1,
      preset: 'text.basic',
      data: { content: '## Heading\n\n- Item', format: 'markdown', title: 'Notes' },
    };

    const canvasMarkup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );
    const overlayMarkup = renderToStaticMarkup(
      React.createElement(ContainerRenderer, {
        section: {
          id: 'text-root',
          layout: 'stack',
          blocks: [
            {
              id: 'text-content',
              kind: 'textarea',
              label: 'Text',
              binding: { path: '/content', valueType: 'string' },
            },
          ],
        },
        context: {
          node,
          allNodes: [node],
          selectedNodeIds: [node.id],
          isSelected: true,
          isExpanded: true,
          layout: {
            width: 720,
            height: 420,
            density: 'expanded',
            surface: 'overlay',
            overflow: 'scroll',
          },
          depth: 0,
        },
      }),
    );

    expect(canvasMarkup).toContain('data-canvas-text-display="markdown"');
    expect(canvasMarkup).toContain('node-card--opaque');
    expect(canvasMarkup).toContain('node-header--foundational');
    expect(canvasMarkup).toContain('Notes');
    expect(canvasMarkup).toContain('<h2');
    expect(canvasMarkup).not.toContain('<textarea');
    expect(canvasMarkup).not.toContain('preset.text.content');
    expect(overlayMarkup).toContain('<textarea');
  });

  it('shows imported text source identity through the canonical foundational header', () => {
    const node: TextCanvasNode = {
      id: 'text-imported',
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 420, height: 360 },
      zIndex: 1,
      preset: 'text.basic',
      data: {
        content: '# Imported',
        format: 'markdown',
        title: 'BLAME动画化企划.md',
        provenance: {
          importMode: 'snapshot',
          sourcePath: 'assets/BLAME动画化企划.md',
          sourceName: 'BLAME动画化企划.md',
        },
      },
    };

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-node-header-source="file"');
    expect(markup).toContain('data-node-header-icon="file"');
    expect(markup).toContain('BLAME动画化企划.md');
    expect(markup).not.toContain('>新文本<');
  });

  it('keeps Markdown punctuation literal for plain text nodes', () => {
    const node: TextCanvasNode = {
      id: 'text-plain',
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 360, height: 240 },
      zIndex: 1,
      preset: 'text.basic',
      data: { content: '# Literal\n  indented', format: 'plain' },
    };

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-canvas-text-display="plain"');
    expect(markup).toContain('# Literal');
    expect(markup).not.toContain('<h1');
    expect(markup).not.toContain('<textarea');
  });

  it('clamps tiny composable nodes to their minimum render size and scrolls overflow', () => {
    const node = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Tiny Scene', sceneNumber: 4 },
      }),
      id: 'scene-tiny',
      size: { width: 90, height: 60 },
      container: { policy: 'scene', childIds: [] },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('width:320px');
    expect(markup).toContain('height:220px');
    expect(markup).toContain('data-node-density="compact"');
    expect(markup).toContain('data-node-overflow="scroll"');
    expect(markup).toContain('flex min-h-0 min-w-0 flex-1 flex-col overflow-auto');
    expect(markup).not.toContain('Default path');
  });

  it('renders migrated shot generation preview from selected candidate data', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 3,
          visualDescription: 'Selected image',
          generationHistory: [
            {
              id: 'candidate-1',
              dataUrl: 'data:image/png;base64,aaa',
              prompt: 'first',
              timestamp: 1,
              selected: true,
            },
          ],
        },
      }),
      id: 'shot-1',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data:image/png;base64,aaa');
    expect(markup).toContain('data-shot-canvas-review-surface="true"');
    expect(markup).toContain('data-shot-canvas-review-preview="true"');
    expect(markup).not.toContain('data-content-block-id="shot-generated-preview"');
    expect(markup).not.toContain('Default path');
  });

  it('renders migrated shot preview from a reference image before generation', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 4,
          visualDescription: 'Imported comic panel',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-reference',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data:image/png;base64,reference');
    expect(markup).toContain('data-shot-canvas-review-surface="true"');
    expect(markup).toContain('data-shot-canvas-review-preview="true"');
    expect(markup).not.toContain('data-content-block-id="shot-generated-preview"');
    expect(markup).not.toContain('Default path');
  });

  it('renders migrated shot preview from a materialized document reference image', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 5,
          visualDescription: 'Imported comic panel',
          referenceImagePath: '/cache/page-1.jpg',
          referenceImageResourceRef: {
            kind: 'document-entry',
            source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
            entryPath: 'OPS/page-1.jpg',
            versionPolicy: 'read-only-source',
          },
          runtimeReferenceImagePath:
            'https://file+.vscode-resource.vscode-cdn.net/cache/page-1.jpg',
        },
      }),
      id: 'shot-runtime-reference',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('https://file+.vscode-resource.vscode-cdn.net/cache/page-1.jpg');
    expect(markup).toContain('data-shot-canvas-review-surface="true"');
    expect(markup).toContain('data-shot-canvas-review-preview="true"');
    expect(markup).not.toContain('data-content-block-id="shot-generated-preview"');
    expect(markup).not.toContain('src="/cache/page-1.jpg"');
    expect(markup).not.toContain('Default path');
  });

  it('renders standalone shots with the prompt-first canvas review surface', () => {
    const videoPrompt = 'rainy hallway, Aki turns back, slow dolly-in';
    const sceneStart = videoPrompt.indexOf('rainy hallway');
    const characterStart = videoPrompt.indexOf('Aki');
    const actionStart = videoPrompt.indexOf('turns back');
    const cameraStart = videoPrompt.indexOf('slow dolly-in');
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 2,
          duration: 3,
          visualDescription: 'Wide establishing frame',
          characterAction: 'Look toward the skyline',
          dialogue: '你怎么会在这里？',
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-unselected-video',
                blockKind: 'video',
                text: videoPrompt,
                spans: [
                  {
                    kind: 'scene',
                    range: { start: sceneStart, end: sceneStart + 'rainy hallway'.length },
                    fieldId: 'scene.location',
                    source: 'agent',
                  },
                  {
                    kind: 'character',
                    range: { start: characterStart, end: characterStart + 'Aki'.length },
                    fieldId: 'character.ref',
                    source: 'agent',
                  },
                  {
                    kind: 'action',
                    range: { start: actionStart, end: actionStart + 'turns back'.length },
                    fieldId: 'shot.action',
                    source: 'agent',
                  },
                  {
                    kind: 'camera',
                    range: { start: cameraStart, end: cameraStart + 'slow dolly-in'.length },
                    fieldId: 'camera.movement',
                    source: 'agent',
                  },
                ],
              },
            },
            generationParams: {
              duration: 3,
              dialogue: '你怎么会在这里？',
            },
            nextCreativeState: {
              id: 'ready-to-generate-video',
              label: 'Ready to generate video',
              severity: 'info',
              target: 'video-prompt',
              nextActionId: 'generate-video',
            },
          },
        },
      }),
      id: 'shot-unselected',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-shot-canvas-review-surface="true"');
    expect(markup).toContain('data-shot-canvas-review-block="video"');
    expect(markup).toContain('data-shot-canvas-review-field="duration"');
    expect(markup).toContain('data-shot-canvas-review-state-id="ready-to-generate-video"');
    expect(markup).toContain('data-shot-canvas-review-action-id="generate-video"');
    expect(markup).toContain('data-semantic-prompt-text="true"');
    expect(markup).toContain('data-semantic-prompt-visual-style="subtle"');
    expect(markup).toContain('data-semantic-prompt-span-kind="scene"');
    expect(markup).toContain('data-semantic-prompt-span-kind="character"');
    expect(markup).toContain('data-semantic-prompt-span-kind="camera"');
    expect(markup).toContain('text-current');
    expect(markup).not.toContain('text-emerald-800');
    expect(markup).not.toContain('text-cyan-800');
    expect(markup).not.toContain('text-amber-800');
    expect(markup).toContain('rainy hallway');
    expect(markup).toContain('你怎么会在这里？');
    expect(markup).not.toContain('data-content-block-id="shot-status"');
    expect(markup).not.toContain('data-content-block-id="shot-visual-description"');
    expect(markup).not.toContain('data-container-section-id="shot-controls"');
    expect(markup).not.toContain('Default path');
  });

  it('keeps shot overlay details collapsed behind creator-facing preview defaults', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 15,
          duration: 3,
          visualDescription: 'The wish breaks through the dark frame.',
          characterAction: 'The character reaches through the white streaks.',
          characters: [
            {
              characterId: 'char-genie',
              characterName: '燈神',
              entityRef: { entityId: 'entity-genie', entityKind: 'character' },
              role: 'primary',
              action: 'stares forward',
              emotion: 'determined',
              appearanceNotes: 'blue aura and gold cuffs',
              continuityNotes: 'same lamp glow as prior shot',
            },
          ],
          textCues: [
            {
              cueId: 'text-1',
              kind: 'dialogue',
              text: '那一願望實現囉！',
              speakerName: '燈神',
              speakerCharacterId: 'char-genie',
              speakerEntityRef: { entityId: 'entity-genie', entityKind: 'character' },
              confidence: 0.93,
              sourceRefId: 'panel-11',
            },
            {
              cueId: 'text-2',
              kind: 'backgroundText',
              text: '第 11 頁',
              sourceRefId: 'page-header',
            },
          ],
          voiceCues: [
            {
              cueId: 'voice-1',
              kind: 'dialogue',
              text: '那一願望實現囉！',
              speakerName: '燈神',
              speakerCharacterId: 'char-genie',
              speakerEntityRef: { entityId: 'entity-genie', entityKind: 'character' },
              emotion: 'triumphant',
              delivery: 'warm',
              voiceAssetId: 'voice-genie',
            },
          ],
          dialogue: '那一願望實現囉！',
          voiceOver: 'A promise becomes visible.',
          soundCue: 'rushing light',
          generationPrompt: 'Animate the manga panel with drifting smoke and lamp glow.',
          generatedVideoAsset: {
            type: 'generated-video',
            id: 'video-1',
            path: 'generated/video-1.mp4',
            mimeType: 'video/mp4',
            generatedAt: '2026-01-01T00:00:00.000Z',
            prompt: 'Video prompt: smoke curls around the genie.',
            duration: 3,
            width: 1280,
            height: 720,
            fps: 24,
          },
          sourceMediaRefs: [
            {
              refId: 'source-panel-11',
              role: 'source',
              label: 'P11',
              mimeType: 'image/png',
              locator: {
                type: 'tool-result',
                toolCallId: 'readimage-current-result',
                assetIndex: 0,
              },
            },
          ],
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-overlay',
    } as CanvasNode;
    const content = node.content;
    if (!content) {
      throw new Error('Expected shot content');
    }

    const markup = renderToStaticMarkup(
      React.createElement(ContainerRenderer, {
        section: content,
        context: createOverlayRenderContext(node),
      }),
    );

    expect(markup).toContain('data-container-section-id="shot-root"');
    expect(markup).toContain('data-container-section-fill="natural"');
    expect(markup).toContain('max-h-[52vh]');
    expect(markup).toContain('object-contain');
    expect(markup).toContain('data-content-block-id="shot-generated-preview"');
    expect(markup).toContain('data-container-section-id="shot-controls"');
    expect(markup).toContain('data-container-section-id="shot-visual"');
    expect(markup).toContain('data-container-section-id="shot-characters-section"');
    expect(markup).toContain('data-container-section-id="shot-text-cues-section"');
    expect(markup).toContain('data-container-section-id="shot-voice-cues-section"');
    expect(markup).toContain('data-container-section-id="shot-audio"');
    expect(markup).toContain('Controls');
    expect(markup).toContain('Visual');
    expect(markup).toContain('Characters');
    expect(markup).toContain('Text Cues');
    expect(markup).toContain('Voice Cues');
    expect(markup).toContain('Audio');
    expect(markup).not.toContain('data-content-block-id="shot-status"');
    expect(markup).not.toContain('data-content-block-id="shot-visual-description"');
    expect(markup).not.toContain('data-content-block-id="shot-character-action"');
    expect(markup).not.toContain('data-content-block-id="shot-characters"');
    expect(markup).not.toContain('primary');
    expect(markup).not.toContain('stares forward');
    expect(markup).not.toContain('entity-genie');
    expect(markup).not.toContain('blue aura and gold cuffs');
    expect(markup).not.toContain('same lamp glow as prior shot');
    expect(markup).not.toContain('data-content-block-id="shot-text-cues"');
    expect(markup).not.toContain('backgroundText');
    expect(markup).not.toContain('page-header');
    expect(markup).not.toContain('0.93');
    expect(markup).not.toContain('data-content-block-id="shot-voice-cues"');
    expect(markup).not.toContain('triumphant');
    expect(markup).not.toContain('voice-genie');
    expect(markup).not.toContain('data-content-block-id="shot-dialogue"');
    expect(markup).not.toContain('那一願望實現囉！');
    expect(markup).not.toContain('data-content-block-id="shot-voice-over"');
    expect(markup).not.toContain('A promise becomes visible.');
    expect(markup).not.toContain('data-content-block-id="shot-sound-cue"');
    expect(markup).not.toContain('rushing light');
    expect(markup).toContain('Generation');
    expect(markup).toContain('Media');
    expect(markup).not.toContain('data-content-block-id="shot-generation-prompt"');
    expect(markup).not.toContain('Animate the manga panel with drifting smoke and lamp glow.');
    expect(markup).not.toContain('data-content-block-id="shot-generated-video-prompt"');
    expect(markup).not.toContain('Video prompt: smoke curls around the genie.');
    expect(markup).not.toContain('data-content-block-id="shot-source-media-refs"');
    expect(markup).not.toContain('readimage-current-result');
    expect(markup).not.toContain('P11');
  });

  it('renders shot character entity reference states inline', () => {
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 16,
          duration: 3,
          visualDescription: 'Four characters cross the frame.',
          characterAction: 'They cross the frame.',
          characters: [
            {
              characterName: 'Confirmed',
              entityRef: { entityId: 'entity-confirmed', entityKind: 'character' },
            },
            {
              characterName: 'Candidate',
              candidateId: 'candidate-character',
            },
            {
              characterName: 'Unlinked',
            },
            {
              characterName: 'Ambiguous',
              candidateId: 'candidate-ambiguous',
              diagnostics: [
                {
                  code: 'backfill-target-not-found',
                  details: { reason: 'candidate-ambiguous' },
                },
              ],
            },
            {
              characterName: 'Broken',
              entityRef: { entityId: 'entity-broken', entityKind: 'character' },
              defaultRepresentation: {
                role: 'portrait',
                representation: {
                  kind: 'workspace-file',
                  path: 'neko/assets/Characters/missing.png',
                },
                availability: 'orphaned',
              },
            },
          ],
        },
      }),
      id: 'shot-entity-states',
    } as CanvasNode;
    const content = node.content;
    if (!content) {
      throw new Error('Expected shot content');
    }

    const markup = renderToStaticMarkup(
      React.createElement(ContainerRenderer, {
        section: content,
        context: createCanvasContentRenderContext(node),
      }),
    );

    expect(markup).toContain('data-entity-reference-state="confirmed"');
    expect(markup).toContain('data-entity-reference-state="candidate"');
    expect(markup).toContain('data-entity-reference-state="unlinked"');
    expect(markup).toContain('data-entity-reference-state="ambiguous"');
    expect(markup).toContain('data-entity-reference-state="orphaned"');
    expect(markup).toContain('data-entity-reference-badge="confirmed"');
    expect(markup).toContain('data-entity-reference-badge="candidate"');
    expect(markup).toContain('data-entity-reference-badge="unlinked"');
    expect(markup).toContain('data-entity-reference-badge="ambiguous"');
    expect(markup).toContain('data-entity-reference-badge="orphaned"');
    expect(markup).toContain('data-entity-hover-card="confirmed"');
    expect(markup).toContain('data-entity-hover-card="candidate"');
    expect(markup).toContain('data-entity-hover-card="orphaned"');
    expect(markup).toContain('title="Inspect entity"');
    expect(markup).toContain('title="Confirm candidate"');
    expect(markup).toContain('Confirmed');
    expect(markup).toContain('Candidate');
    expect(markup).toContain('Broken');
  });

  it('localizes shot entity reference action titles', () => {
    setLocale('zh-cn');
    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 17,
          duration: 3,
          visualDescription: 'A candidate waits for review.',
          characterAction: 'Candidate waits.',
          characters: [
            {
              characterName: '候选角色',
              candidateId: 'candidate-character',
            },
          ],
        },
      }),
      id: 'shot-entity-i18n',
    } as CanvasNode;
    const content = node.content;
    if (!content) {
      throw new Error('Expected shot content');
    }

    const markup = renderToStaticMarkup(
      React.createElement(ContainerRenderer, {
        section: content,
        context: createCanvasContentRenderContext(node),
      }),
    );

    expect(markup).toContain('title="检查实体"');
    expect(markup).toContain('title="确认候选"');
    expect(markup).toContain('候选');
    expect(markup).toContain('候选角色 已关联到候选 candidate-character。');
    expect(markup).not.toContain('>candidate<');
  });

  it('localizes composable shot control values', () => {
    setLocale('zh-cn');

    const node = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 2,
          duration: 3,
          visualDescription: 'Wide establishing frame',
          shotScale: 'MS',
          cameraMovement: 'static',
          cameraAngle: 'eye-level',
          generationStatus: 'idle',
        },
      }),
      id: 'shot-localized',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('空闲');
    expect(markup).toContain('MS — 中景');
    expect(markup).toContain('静止');
    expect(markup).toContain('平视');
    expect(markup).not.toContain('&gt;idle&lt;');
    expect(markup).not.toContain('&gt;static&lt;');
    expect(markup).not.toContain('&gt;eye-level&lt;');
  });

  it('builds persistent container collapse updates without changing non-container nodes', () => {
    const containerNode = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        data: {},
      }),
      id: 'scene-container',
      container: {
        policy: 'scene',
        childIds: ['shot-1'],
        metadata: { tone: 'quiet' },
      },
    } as CanvasNode;
    const leafNode = buildCanvasNode({
      type: 'shot',
      position: { x: 0, y: 0 },
      zIndex: 1,
      data: {},
    }) as CanvasNode;

    expect(createNodeCollapseUpdate(containerNode, true)).toEqual({
      container: {
        policy: 'scene',
        childIds: ['shot-1'],
        metadata: { tone: 'quiet' },
        collapsed: true,
      },
    });
    expect(createNodeCollapseUpdate(leafNode, true)).toBeUndefined();
  });

  it('renders collapsed composable containers at header height only', () => {
    const node = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Collapsed Scene', sceneNumber: 1 },
      }),
      id: 'scene-collapsed',
      container: { policy: 'scene', childIds: [], collapsed: true },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('height:42px');
    expect(markup).toContain('Collapsed Scene');
    expect(markup).not.toContain('data-content-block-id="scene-title"');
    expect(markup).not.toContain('data-child-slot-id="scene-children"');
  });

  it('renders project nodes through the default composable preset when unselected', () => {
    const node = {
      id: 'project-1',
      type: 'project',
      position: { x: 0, y: 0 },
      size: { width: 260, height: 180 },
      zIndex: 0,
      data: {
        projectPath: 'projects/demo.nkv',
        projectTitle: 'Demo',
        projectType: 'nkv',
      },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-content-block-id="project-asset-preview"');
    expect(markup).toContain('Video Project');
    expect(markup).not.toContain('Default path');
    expect(markup).not.toContain('UNSUPPORTED');
  });

  it('renders scene shot children as a default storyboard table', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: {
          sceneTitle: 'Arrival',
          sceneNumber: 1,
          location: 'Bridge',
          modelName: 'Video Model A',
          resolution: '1280x720',
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'scene-1:video:prompt',
                blockKind: 'video',
                text: 'Scene-level camera and motion prompt.',
              },
            },
          },
        },
      }),
      id: 'scene-1',
      container: { policy: 'scene', childIds: ['shot-1'] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: { shotNumber: 1, visualDescription: 'Train door' },
      }),
      id: 'shot-1',
      parentId: 'scene-1',
      preview: {
        nodeId: 'shot-1',
        title: 'Shot 1',
        subtitle: 'Train door',
        role: 'node-summary',
      },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: { ...createContext(scene, [scene, shot]), isSelected: true },
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).not.toContain('Assign selected');
    expect(markup).not.toContain('Auto layout');
    expect(markup).not.toContain('Batch generate');
    expect(markup).toContain('data-child-slot-id="scene-children"');
    expect(markup).toContain('data-child-slot-variant="summary-large"');
    expect(markup).toContain('data-child-slot-kind="scene-shot-table"');
    expect(markup).toContain('data-scene-review-surface="true"');
    expect(markup).toContain('data-scene-view-mode="storyboard-table"');
    expect(markup).toContain('data-scene-review-header="true"');
    expect(markup).toContain('data-scene-review-title="true"');
    expect(markup).toContain('Scene 1 · Arrival');
    expect(markup).toContain('Bridge');
    expect(markup).toContain('data-scene-review-metric="resolution"');
    expect(markup).toContain('data-scene-review-metric="model"');
    expect(markup).toContain('Scene-level camera and motion prompt.');
    expect(markup).toContain('data-scene-shot-table="true"');
    expect(markup).toContain('data-scene-shot-table-row-id="shot-1"');
    expect(markup).toContain('data-scene-shot-table-column="reference-media"');
    expect(markup).toContain('data-scene-shot-table-column="image-prompt"');
    expect(markup).not.toContain('data-scene-shot-table-column="video-prompt"');
    expect(markup).toContain('data-scene-shot-table-column="state"');
    expect(markup).toContain('data-scene-shot-table-column="action"');
    expect(markup).toContain('Storyboard Table');
    expect(markup).toContain('Creative View');
    expect(markup).toContain('Reference Media');
    expect(markup).toContain('Scene Video Prompt');
    expect(markup).toContain('Optimize scene video prompt');
    expect(markup).toContain('data-scene-cell-text-bounded="true"');
    expect(markup).not.toContain('data-scene-shot-rail="true"');
    expect(markup).not.toContain('data-child-card-layout="detail"');
    expect(markup).not.toContain('data-child-detail-id="shot-1"');
    expect(markup).not.toContain('data-node-card-id="shot-1"');
    expect(markup).not.toContain('Default path');
  });

  it('renders parent-linked scene children even when container childIds are stale', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Parent Linked', sceneNumber: 3 },
      }),
      id: 'scene-parent-linked',
      container: { policy: 'scene', childIds: [] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: { shotNumber: 7, visualDescription: 'Visible through parentId' },
      }),
      id: 'shot-parent-linked',
      parentId: 'scene-parent-linked',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(scene, [scene, shot]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-child-slot-id="scene-children"');
    expect(markup).toContain('data-child-slot-kind="scene-shot-table"');
    expect(markup).toContain('data-scene-shot-table-row-id="shot-parent-linked"');
    expect(markup).toContain('data-scene-shot-table-cell="shot"');
    expect(markup).toContain('data-scene-shot-action-id="optimize-video-prompt"');
    expect(markup).not.toContain('No shots');
    expect(markup).not.toContain('Default path');
  });

  it('projects missing and directly usable reference media states in the storyboard table', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Reference States', sceneNumber: 4 },
      }),
      id: 'scene-reference-states',
      container: {
        policy: 'scene',
        childIds: ['shot-missing-reference', 'shot-usable-reference'],
      },
    } as CanvasNode;
    const missingReferenceShot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 1,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
          },
        },
      }),
      id: 'shot-missing-reference',
      parentId: 'scene-reference-states',
    } as CanvasNode;
    const usableVideoPrompt = 'Animate the usable reference frame with slow camera drift.';
    const usableCameraStart = usableVideoPrompt.indexOf('slow camera drift');
    const usableReferenceShot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 40, y: 20 },
        zIndex: 2,
        preset: 'shot.basic',
        data: {
          shotNumber: 2,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            referenceMedia: {
              imageRefs: [
                {
                  refId: 'ref-image-1',
                  role: 'source',
                  label: 'Reference frame',
                  locator: {
                    type: 'asset',
                    assetId: 'asset-ref-image-1',
                    uri: 'assets/ref-image-1.png',
                  },
                  mimeType: 'image/png',
                },
              ],
            },
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-usable-reference:video:prompt',
                blockKind: 'video',
                text: usableVideoPrompt,
                spans: [
                  {
                    id: 'camera:slow-camera-drift',
                    kind: 'camera',
                    range: {
                      start: usableCameraStart,
                      end: usableCameraStart + 'slow camera drift'.length,
                    },
                    fieldId: 'camera.movement',
                    source: 'agent',
                  },
                ],
              },
            },
          },
        },
      }),
      id: 'shot-usable-reference',
      parentId: 'scene-reference-states',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(scene, [scene, missingReferenceShot, usableReferenceShot]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-scene-shot-table-row-id="shot-missing-reference"');
    expect(markup).toContain('Add or process reference');
    expect(markup).toContain('data-scene-shot-action-id="process-reference"');
    expect(markup).toContain('data-scene-shot-table-row-id="shot-usable-reference"');
    expect(markup).not.toContain('image:1');
    expect(markup).toContain('data-scene-reference-media-preview="true"');
    expect(markup).toContain('data-scene-reference-media-preview-fit="intrinsic"');
    expect(markup).toContain('w-fit');
    expect(markup).toContain('max-h-[120px]');
    expect(markup).toContain('max-h-[148px]');
    expect(markup).toContain('grid-cols-[minmax(72px,1fr)]');
    expect(markup).toContain('grid-cols-[minmax(72px,2fr)_minmax(0,1fr)]');
    expect(markup).not.toContain('grid-cols-[44px');
    expect(markup).toContain('Image prompt skipped');
    expect(markup).toContain('data-semantic-prompt-text="true"');
    expect(markup).toContain('data-semantic-prompt-visual-style="subtle"');
    expect(markup).toContain('text-current');
    expect(markup).toContain('data-scene-shot-action-id="generate-video"');
  });

  it('renders markdown extension syntax in scene and shot prompt cells', () => {
    const sceneStoryboardPrompt = {
      version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
      promptBlocks: {
        videoPromptDocument: {
          version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
          documentId: 'scene-markdown:video:prompt',
          blockKind: 'video',
          text: '场景视频生成：**远景** @Rui 使用 ![[p06#panel_1]] 作为连续参考。',
        },
      },
    };
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: {
          sceneTitle: 'Markdown Prompt Scene',
          sceneNumber: 5,
        },
      }),
      id: 'scene-markdown-prompts',
      data: {
        sceneTitle: 'Markdown Prompt Scene',
        sceneNumber: 5,
        storyboardPrompt: sceneStoryboardPrompt,
      },
      container: {
        policy: 'scene',
        childIds: ['shot-markdown-prompts'],
      },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 40, y: 20 },
        zIndex: 2,
        preset: 'shot.basic',
        data: {
          shotNumber: 1,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              imagePromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-markdown:image:prompt',
                blockKind: 'image',
                text: '图像编辑：`裁切` @Rui，并使用 ![p06](P6#panel_1) 作为参考。',
              },
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-markdown:video:prompt',
                blockKind: 'video',
                text: '镜头视频：*推近* [[p07#panel_2]]，保持人物动作连续。',
              },
            },
          },
        },
      }),
      id: 'shot-markdown-prompts',
      parentId: 'scene-markdown-prompts',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(scene, [scene, shot]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-scene-video-prompt-summary="true"');
    expect(markup).toContain('data-scene-shot-table-cell="image-prompt"');
    expect(markup).not.toContain('data-scene-shot-table-cell="video-prompt"');
    expect(markup).toContain('data-markdown-inline-strong="true"');
    expect(markup).toContain('data-markdown-inline-code="true"');
    expect(markup).toContain('data-markdown-mention="true"');
    expect(markup).toContain('data-markdown-image-reference="true"');
    expect(markup).toContain('data-markdown-resource-reference="true"');
    expect(markup).toContain('data-semantic-prompt-generation-parts="true"');
    expect(markup).toContain('data-markdown-generation-prompt-parts="true"');
    expect(markup).toContain('data-markdown-generation-prompt-part-kind="intent"');
    expect(markup).toContain('data-markdown-generation-prompt-part-kind="reference"');
    expect(markup).toContain('data-markdown-generation-prompt-part-kind="operation"');
  });

  it('renders fixed storyboard next-action buttons from semantic next state', () => {
    const actions = [
      'process-reference',
      'optimize-image-prompt',
      'optimize-video-prompt',
      'generate-image',
      'generate-video',
      'review-result',
      'fix-alignment',
      'accept-result',
      'retry',
    ] as const;
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Actions', sceneNumber: 6 },
      }),
      id: 'scene-actions',
      container: { policy: 'scene', childIds: actions.map((action) => `shot-${action}`) },
    } as CanvasNode;
    const shots = actions.map(
      (action, index) =>
        ({
          ...buildCanvasNode({
            type: 'shot',
            position: { x: 20 + index * 20, y: 20 },
            zIndex: index + 1,
            preset: 'shot.basic',
            data: {
              shotNumber: index + 1,
              storyboardPrompt: {
                version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
                nextCreativeState: {
                  id: `state-${action}`,
                  label: `State ${action}`,
                  severity: action === 'retry' ? 'error' : 'info',
                  target: actionTarget(action),
                  nextActionId: action,
                },
              },
            },
          }),
          id: `shot-${action}`,
          parentId: 'scene-actions',
        }) as CanvasNode,
    );

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(scene, [scene, ...shots]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    for (const action of actions) {
      expect(markup).toContain(`data-scene-shot-action-id="${action}"`);
    }
    expect(markup).toContain('Process reference');
    expect(markup).toContain('Optimize image prompt');
    expect(markup).toContain('Optimize scene video prompt');
    expect(markup).toContain('Generate image');
    expect(markup).toContain('Generate video');
    expect(markup).toContain('Review result');
    expect(markup).toContain('Fix alignment');
    expect(markup).toContain('Accept result');
    expect(markup).toContain('Retry');
  });

  it('localizes storyboard next state labels and targets in Chinese', () => {
    setLocale('zh-cn');
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: '状态本地化', sceneNumber: 9 },
      }),
      id: 'scene-state-i18n',
      container: { policy: 'scene', childIds: ['shot-state-i18n'] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 1,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            referenceMedia: {
              imageRefs: [
                {
                  refId: 'ref-image',
                  role: 'source',
                  locator: { type: 'asset', assetId: 'ref-image', uri: 'assets/ref-image.png' },
                  mimeType: 'image/png',
                },
              ],
            },
          },
        },
      }),
      id: 'shot-state-i18n',
      parentId: 'scene-state-i18n',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(scene, [scene, shot]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('aria-label="下一步创作状态: 优化场景视频提示词"');
    expect(markup).toContain('>优化场景视频提示词<');
    expect(markup).toContain('>场景视频提示词</span>');
    expect(markup).not.toContain('Optimize scene video prompt');
    expect(markup).not.toContain('>video-prompt</span>');
  });

  it('keeps storyboard table navigation local and reserves Agent handoff for next-action intents', () => {
    const source = readFileSync(new URL('./ContainerRenderer.tsx', import.meta.url), 'utf8');
    const openDetailsStart = source.indexOf('const handleOpenDetails = useCallback(() => {');
    const actionIntentStart = source.indexOf(
      'const handleDispatchActionIntent = useCallback(() => {',
    );
    expect(openDetailsStart).toBeGreaterThanOrEqual(0);
    expect(actionIntentStart).toBeGreaterThan(openDetailsStart);

    const localActionSource = source.slice(openDetailsStart, actionIntentStart);
    expect(localActionSource).toContain("'open-content-overlay'");
    expect(localActionSource).toContain('dispatchNodeCardAction');
    expect(localActionSource).not.toContain('storyboardActionIntent');
    expect(localActionSource).not.toContain('neko.agent');

    const intentActionSource = source.slice(
      actionIntentStart,
      source.indexOf('}, [parentNode, row]);'),
    );
    expect(intentActionSource).toContain("type: 'storyboardActionIntent'");
    expect(intentActionSource).toContain('createStoryboardActionIntent(parentNode, row)');
    const intentFactorySource = source.slice(
      source.indexOf('function createStoryboardActionIntent('),
      source.indexOf('function resolveSceneTableMinWidth('),
    );
    expect(intentFactorySource).toContain('promptDocuments');
    expect(intentFactorySource).toContain('readSceneStoryboardPromptState(sceneNode)');
    expect(intentFactorySource).toContain('listPromptDocumentRefsForAction');
    expect(intentFactorySource).toContain('sceneState?.promptBlocks?.videoPromptDocument');
    expect(intentFactorySource).toContain('expectedNextStateId: row.stateId');
    expect(intentFactorySource).toContain('referenceMedia');
    expect(intentFactorySource).toContain('generationParams');
    expect(intentFactorySource).toContain('expectedNextStateId');
    expect(intentFactorySource).toContain('resultRef');
  });

  it('keeps provider progress out of storyboard table state and shows completed result review', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Result Review', sceneNumber: 7 },
      }),
      id: 'scene-result-review',
      container: { policy: 'scene', childIds: ['shot-result-review'] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 1,
          generationStatus: 'running',
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-result-review:video:prompt',
                blockKind: 'video',
                text: 'Slow camera push after the result arrives',
              },
            },
            executionRefs: {
              resultRefs: [
                {
                  mediaRef: {
                    refId: 'generated-video',
                    role: 'generated',
                    locator: {
                      type: 'asset',
                      assetId: 'generated-video',
                      uri: 'assets/generated-video.mp4',
                    },
                    mimeType: 'video/mp4',
                  },
                },
              ],
            },
          },
        },
      }),
      id: 'shot-result-review',
      parentId: 'scene-result-review',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(scene, [scene, shot]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('Review result');
    expect(markup).toContain('data-scene-shot-action-id="review-result"');
    expect(markup).not.toContain('running');
  });

  it('keeps generic detail-card child slots scrollable in constrained containers', () => {
    const parent = {
      ...buildCanvasNode({
        type: 'table',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'table.basic',
        data: { label: 'Detail Grid', columnCount: 2, rowCount: 2 },
      }),
      id: 'table-detail-cards',
      container: { policy: 'table', childIds: ['note-detail'] },
    } as CanvasNode;
    const child = {
      ...buildCanvasNode({
        type: 'annotation',
        position: { x: 20, y: 20 },
        zIndex: 1,
        data: { content: 'Scrollable child summary' },
      }),
      id: 'note-detail',
      parentId: 'table-detail-cards',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(parent, [parent, child]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-child-slot-id="table-children"');
    expect(markup).toContain('data-child-slot-kind="detail-cards"');
    expect(markup).toContain('data-child-slot-overflow="scroll"');
    expect(markup).toContain('flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-1.5 overflow-auto');
    expect(markup).toContain('Scrollable child summary');
    expect(markup).not.toContain('Default path');
  });

  it('renders Markdown review rows as a table inside table.basic nodes', () => {
    const node = {
      ...buildCanvasNode({
        type: 'table',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'table.basic',
        data: {
          label: 'Storyboard Review',
          columnCount: 4,
          rowCount: 1,
          markdown: {
            tableProfile: 'storyboard',
            columns: [
              { id: 'scene', label: 'scene' },
              { id: 'shot', label: 'shot' },
              { id: 'source', label: 'source' },
              { id: 'imagePrompt', label: 'imagePrompt' },
              { id: 'videoPrompt', label: 'videoPrompt' },
            ],
            rows: [
              {
                id: 'row-1',
                cells: {
                  scene: 'Rain hallway',
                  shot: '1',
                  source: 'P1#panel_1',
                  imagePrompt: 'colorize and repair the panel',
                  videoPrompt: 'slow dolly-in as Aki turns back',
                },
                resources: [{ token: 'P1', status: 'bound' }],
                actionId: 'create-storyboard-nodes',
              },
            ],
          },
        },
      }),
      id: 'table-markdown-review',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-content-block-id="table-markdown-rows"');
    expect(markup).toContain('data-markdown-review-table="true"');
    expect(markup).toContain('<table');
    expect(markup).toContain('<thead');
    expect(markup).toContain('<tbody');
    expect(markup).toContain('data-markdown-review-column="scene"');
    expect(markup).toContain('data-markdown-review-cell="imagePrompt"');
    expect(markup).toContain('Rain hallway');
    expect(markup).toContain('P1#panel_1');
    expect(markup).toContain('colorize and repair the panel');
    expect(markup).toContain('slow dolly-in as Aki turns back');
    expect(markup).not.toContain('data-content-block-id="table-markdown-row-cells"');
    expect(markup).not.toContain('Cells');
    expect(markup).not.toContain('Item 1');
    expect(markup).not.toContain('Default path');
  });

  it('keeps scene storyboard table horizontally scrollable when a scene container is narrow', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Narrow', sceneNumber: 2 },
      }),
      id: 'scene-narrow',
      size: { width: 340, height: 240 },
      container: { policy: 'scene', childIds: ['shot-1', 'shot-2'] },
    } as CanvasNode;
    const children = ['shot-1', 'shot-2'].map(
      (id, index) =>
        ({
          ...buildCanvasNode({
            type: 'shot',
            position: { x: 20 + index * 20, y: 20 },
            zIndex: index + 1,
            preset: 'shot.basic',
            data: {
              shotNumber: index + 1,
              visualDescription: `Beat ${index + 1}`,
              ...(index === 0 ? { referenceImagePath: 'data:image/png;base64,review-source' } : {}),
            },
          }),
          id,
          parentId: 'scene-narrow',
        }) as CanvasNode,
    );

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(scene, [scene, ...children]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-node-density="compact"');
    expect(markup).toContain('data-child-slot-variant="summary-large"');
    expect(markup).toContain('data-child-slot-kind="scene-shot-table"');
    expect(markup).toContain('data-child-slot-card-height="180"');
    expect(markup).toContain('data-child-slot-card-max-height="280"');
    expect(markup).toContain('data-scene-shot-table="true"');
    expect(markup).toContain('overflow-auto');
    expect(markup).toContain('min-width:912px');
    expect(markup).toContain('data-scene-prompt-cell-text="true"');
    expect(markup).not.toContain('data-scene-prompt-cell-text="true"><div class="line-clamp');
    expect(markup).not.toContain('max-h-[720px]');
    expect(markup).toContain('data-scene-shot-table-column="reference-media"');
    expect(markup).toContain('data-scene-shot-table-column="image-prompt"');
    expect(markup).not.toContain('data-scene-shot-table-column="video-prompt"');
    expect(markup).toContain('data-scene-shot-table-row-id="shot-1"');
    expect(markup).toContain('data-scene-shot-table-row-id="shot-2"');
    expect(markup).toContain('Optimize scene video prompt');
    expect(markup).not.toContain('data-child-card-layout="detail"');
    expect(markup).not.toContain('data-scene-shot-rail="true"');
    expect(markup).not.toContain('Default path');
  });

  it('projects scene shot table rows in canonical child order with default review columns', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Projection', sceneNumber: 8 },
      }),
      id: 'scene-projection',
      container: { policy: 'scene', childIds: ['shot-b', 'shot-a'] },
    } as CanvasNode;
    const shotA = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 1,
          duration: 2.5,
          visualDescription: 'Second row visual',
          characterAction: 'turns',
          characters: [{ characterName: 'Mika', role: 'primary' }],
          dialogue: 'We start now.',
          sceneTags: ['interior'],
          generationPrompt: 'Mika turns toward the neon window, storyboard frame',
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              imagePromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-a:image:prompt',
                blockKind: 'image',
                text: 'Clean the neon window keyframe',
              },
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'shot-a:video:prompt',
                blockKind: 'video',
                text: 'Mika turns toward the neon window, slow dolly in',
              },
            },
            referenceMedia: {
              imageRefs: [
                {
                  refId: 'source-panel',
                  role: 'reference',
                  locator: {
                    type: 'asset',
                    assetId: 'source-panel',
                    uri: 'assets/source-panel.png',
                  },
                  mimeType: 'image/png',
                },
              ],
            },
            generationParams: { duration: 2.5, dialogue: 'We start now.' },
          },
          generationStatus: 'done',
          generatedImage: 'data:image/png;base64,done',
          shotImagePrepPlan: imagePrepPlan,
        },
      }),
      id: 'shot-a',
      parentId: 'scene-projection',
    } as CanvasNode;
    const shotB = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 2,
        preset: 'shot.basic',
        data: {
          shotNumber: 2,
          duration: 4,
          visualDescription: 'First row visual',
          cameraMovement: 'dolly-in',
          generationStatus: 'idle',
          continuityDiagnostics: [{ code: 'gap', message: 'Missing entrance beat' }],
        },
      }),
      id: 'shot-b',
      parentId: 'scene-projection',
    } as CanvasNode;

    const rows = projectSceneShotTableRows(scene, [shotB, shotA]);

    expect(rows.map((row) => row.id)).toEqual(['shot-b', 'shot-a']);
    expect(rows[0]?.visualAction).toBe('First row visual');
    expect(rows[0]?.camera).toContain('dolly-in');
    expect(rows[0]?.diagnosticCount).toBe(2);
    expect(rows[1]?.duration).toBe('2.5s');
    expect(rows[1]?.dialogue).toBe('We start now.');
    expect(rows[1]?.characters).toBe('Mika');
    expect(rows[1]?.imagePrompt).toBe('Clean the neon window keyframe');
    expect(rows[1]?.imagePromptDocument?.documentId).toBe('shot-a:image:prompt');
    expect(rows[1]?.videoPrompt).toBe('Mika turns toward the neon window, slow dolly in');
    expect(rows[1]?.videoPromptDocument?.documentId).toBe('shot-a:video:prompt');
    expect(rows[1]?.referenceMedia).toBe('image:1');
    expect(rows[1]?.state).toBe('Ready to generate video');
    expect(rows[1]?.nextActionId).toBe('generate-video');
    expect(rows[1]?.imagePrep).toContain('transform-original');
    expect(rows[1]?.imagePrep).toContain('rotate');
    expect(rows[1]?.imagePrep).toContain('split-panels');
    expect(rows[1]?.imagePrep).toContain('colorize');
    expect(rows[1]?.imagePrep).toContain('Transform source');
    expect(rows[1]?.imagePrep).toContain('rotate-90');
    expect(rows[1]?.imagePrep).toContain('3 panels');
    expect(rows[1]?.hasImage).toBe(true);
    expect(resolveSceneShotTableColumns('creator-review')).toEqual([
      'shot',
      'reference-media',
      'image-prompt',
      'duration',
      'dialogue',
      'state',
      'action',
    ]);
    expect(filterSceneShotTableRows(rows, 'missing-image').map((row) => row.id)).toEqual([
      'shot-b',
    ]);
    expect(filterSceneShotTableRows(rows, 'has-diagnostics').map((row) => row.id)).toEqual([
      'shot-b',
    ]);
  });

  it('uses scene-level video prompts for row action state without copying them into shot rows', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: {
          sceneTitle: 'Scene Video',
          sceneNumber: 2,
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            promptBlocks: {
              videoPromptDocument: {
                version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
                documentId: 'scene-video:video:prompt',
                blockKind: 'video',
                text: 'Use the source panels as a continuous snowy survival scene.',
              },
            },
          },
        },
      }),
      id: 'scene-video',
      container: { policy: 'scene', childIds: ['shot-scene-video'] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 1,
          duration: 3,
          visualDescription: 'Agni walks through snow.',
          storyboardPrompt: {
            version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
            referenceMedia: {
              imageRefs: [
                {
                  refId: 'P4',
                  role: 'source',
                  locator: { type: 'workspace-path', path: 'image/moe-015247.jpg' },
                },
              ],
            },
            generationParams: { duration: 3 },
            nextCreativeState: {
              id: 'missing-video-prompt',
              label: 'Optimize scene video prompt',
              severity: 'warning',
              target: 'video-prompt',
              nextActionId: 'optimize-video-prompt',
            },
          },
        },
      }),
      id: 'shot-scene-video',
      parentId: 'scene-video',
    } as CanvasNode;

    const rows = projectSceneShotTableRows(scene, [shot]);

    expect(rows[0]?.videoPrompt).toBe('');
    expect(rows[0]?.videoPromptDocument).toBeUndefined();
    expect(rows[0]?.state).toBe('Image prompt skipped');
    expect(rows[0]?.nextActionId).toBe('generate-video');
  });

  it('projects storyboard and animation plan fields into scene shot table rows', () => {
    const scene = {
      ...buildCanvasNode({
        type: 'scene',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'scene.basic',
        data: { sceneTitle: 'Animation Import', sceneNumber: 1, sceneId: 'scene-1' },
      }),
      id: 'scene-animation-import',
      container: { policy: 'scene', childIds: ['shot-animation'] },
    } as CanvasNode;
    const shot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotId: 'shot-1',
          shotNumber: 1,
          duration: 4,
          visualDescription: 'Rin sees the signal.',
          characterAction: 'Rin leans closer.',
          sceneTags: ['signal'],
          visualStyle: 'watercolor manga',
          generationPrompt: 'base storyboard prompt\ncinematic rain motion\nhair moves in the rain',
          shotImagePrepPlan: {
            schemaVersion: 1,
            kind: 'shot-image-prep-plan',
            planId: 'shot-1-image-prep',
            sceneId: 'scene-1',
            shotId: 'shot-1',
            sourceMediaRefs: [],
            imageStrategy: 'use-as-reference',
            operationPlan: ['remove-text', 'upscale', 'generate-keyframe'],
            targetStyle: 'watercolor manga',
            editInstruction: 'clean speech text',
            generationPrompt:
              'base storyboard prompt\ncinematic rain motion\nhair moves in the rain',
            status: 'planned',
          },
        },
      }),
      id: 'shot-animation',
      parentId: 'scene-animation-import',
    } as CanvasNode;

    const rows = projectSceneShotTableRows(scene, [shot]);

    expect(rows[0]?.tagsStyle).toContain('signal');
    expect(rows[0]?.tagsStyle).toContain('watercolor manga');
    expect(rows[0]?.imagePrep).toContain('planned');
    expect(rows[0]?.imagePrep).toContain('use-as-reference');
    expect(rows[0]?.imagePrep).toContain('remove-text');
    expect(rows[0]?.imagePrep).toContain('upscale');
    expect(rows[0]?.storyboardPrompt).toBe('');
    expect(rows[0]?.state).toBe('Migrate prompt document');
    expect(rows[0]?.nextActionId).toBe('fix-alignment');
  });

  it('reuses shot preview-source behavior for scene table generated and referenced images', () => {
    const generatedShot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 1,
          visualDescription: 'Generated',
          generationHistory: [
            {
              id: 'candidate-selected',
              dataUrl: 'data:image/png;base64,selected',
              selected: true,
            },
          ],
        },
      }),
      id: 'shot-generated',
    } as CanvasNode;
    const referencedShot = {
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'shot.basic',
        data: {
          shotNumber: 2,
          visualDescription: 'Referenced',
          referenceImagePath: 'data:image/png;base64,reference',
        },
      }),
      id: 'shot-reference',
    } as CanvasNode;

    const generatedSource = resolveShotPreviewSource(generatedShot);
    const referencedSource = resolveShotPreviewSource(referencedShot);

    expect(generatedSource.renderForm).toBe('asset-thumbnail');
    expect(
      generatedSource.renderForm === 'asset-thumbnail'
        ? generatedSource.source.variants?.[0]?.sourcePath
        : undefined,
    ).toBe('data:image/png;base64,selected');
    expect(referencedSource.renderForm).toBe('asset-thumbnail');
    expect(
      referencedSource.renderForm === 'asset-thumbnail'
        ? referencedSource.source.variants?.[0]?.sourcePath
        : undefined,
    ).toBe('data:image/png;base64,reference');

    const reviewSource = resolveShotReviewPreviewSource(referencedShot);
    expect(reviewSource.renderForm).toBe('asset-thumbnail');
    expect(
      reviewSource.renderForm === 'asset-thumbnail' ? reviewSource.source.role : undefined,
    ).toBe('source-image');
    expect(
      reviewSource.renderForm === 'asset-thumbnail'
        ? reviewSource.source.variants?.[0]?.role
        : undefined,
    ).toBe('source-image');
  });

  it('keeps creator presentation runtime state out of Canvas data writers', () => {
    const projectionSource = readFileSync(
      new URL('./creatorPresentation.ts', import.meta.url),
      'utf8',
    );
    const rendererSource = readFileSync(
      new URL('./ContainerRenderer.tsx', import.meta.url),
      'utf8',
    );

    expect(projectionSource).not.toContain('runtimeUrl');
    expect(projectionSource).not.toContain('objectUrl');
    expect(projectionSource).not.toContain('objectURL');
    expect(projectionSource).not.toContain('cachePath');
    expect(projectionSource).not.toContain('updateNodeData');
    expect(rendererSource).not.toContain('asWebviewUri');
    expect(rendererSource).not.toContain('tableScroll');
    expect(rendererSource).not.toContain('activeRowFocus');
  });

  it('renders migrated gallery container with childSlots layout', () => {
    const node = {
      ...buildCanvasNode({
        type: 'gallery',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'gallery.basic',
        data: {
          characterName: 'Mika',
          preset: 'character-3view',
          rows: 1,
          cols: 3,
        },
      }),
      id: 'gallery-1',
      container: {
        policy: 'gallery',
        childIds: [],
        layout: { mode: 'gallery' },
        acceptedChildren: { nodeTypes: ['media'] },
        deleteBehavior: 'delete-subtree',
      },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(node),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('Mika');
    expect(markup).toContain('No views (drag media here)');
    expect(markup).toContain('3-View Character');
    expect(markup).toContain('0 views');
    expect(markup).not.toContain('0 cells');
    expect(markup).toContain('data-child-slot-id="gallery-children"');
    expect(markup).toContain('data-child-slot-variant="gallery"');
    expect(markup).toContain('data-child-slot-kind="gallery-grid"');
    expect(markup).toContain('data-child-slot-card-height="170"');
    expect(markup).not.toContain('data-content-block-id="gallery-global-prompt"');
    expect(markup).not.toContain('Character Profile');
    expect(markup).not.toContain('Default path');
  });

  it('shows gallery advanced fields only in expanded content context', () => {
    const node = {
      ...buildCanvasNode({
        type: 'gallery',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'gallery.basic',
        data: {
          characterName: 'Mika',
          preset: 'character-3view',
          globalPromptPrefix: 'clean reference lighting',
          characterProfile: { description: 'A tall elf' },
        },
      }),
      id: 'gallery-expanded',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: { ...createContext(node), isExpanded: true },
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('Advanced');
    expect(markup).toContain('Character Profile');
    expect(markup).not.toContain('data-content-block-id="gallery-global-prompt"');
  });

  it('renders gallery children as image-first grid cards instead of a horizontal rail', () => {
    const gallery = {
      ...buildCanvasNode({
        type: 'gallery',
        position: { x: 0, y: 0 },
        zIndex: 0,
        preset: 'gallery.basic',
        data: {
          characterName: 'Mika',
          preset: 'character-3view',
          rows: 1,
          cols: 3,
        },
      }),
      id: 'gallery-with-children',
      size: { width: 560, height: 420 },
      container: {
        policy: 'gallery',
        childIds: ['media-front', 'media-side'],
        layout: { mode: 'gallery' },
        acceptedChildren: { nodeTypes: ['media'] },
        deleteBehavior: 'delete-subtree',
        childPlacements: {
          'media-front': {
            childId: 'media-front',
            metadata: {
              label: 'Front',
              prompt: 'Front view, neutral pose, clean reference lighting.',
              generationStatus: 'done',
            },
          },
          'media-side': {
            childId: 'media-side',
            metadata: {
              label: 'Side',
              prompt: 'Side view with matching outfit details.',
              generationStatus: 'idle',
            },
          },
        },
      },
    } as CanvasNode;
    const mediaFront = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 20, y: 20 },
        zIndex: 1,
        preset: 'media.basic',
        data: {
          assetPath: 'data:image/png;base64,front',
          mediaType: 'image',
        },
      }),
      id: 'media-front',
      parentId: 'gallery-with-children',
    } as CanvasNode;
    const mediaSide = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 40, y: 20 },
        zIndex: 2,
        preset: 'media.basic',
        data: {
          assetPath: 'data:image/png;base64,side',
          mediaType: 'image',
        },
      }),
      id: 'media-side',
      parentId: 'gallery-with-children',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(gallery, [gallery, mediaFront, mediaSide]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('data-child-slot-id="gallery-children"');
    expect(markup).toContain('data-child-slot-kind="gallery-grid"');
    expect(markup).toContain('data-child-slot-variant="gallery"');
    expect(markup).toContain('data-gallery-review-surface="true"');
    expect(markup).toContain('data-gallery-review-mode="visual-grid"');
    expect(markup).toContain('Visual Grid');
    expect(markup).toContain('Review List');
    expect(markup).toContain('data-child-slot-card-height="240"');
    expect(markup).toContain('data-gallery-child-card-id="media-front"');
    expect(markup).toContain('data-gallery-child-card-layout="visual-grid"');
    expect(markup).toContain('Front view, neutral pose, clean reference lighting.');
    expect(markup).toContain('Done');
    expect(markup).toContain('data:image/png;base64,front');
    expect(markup).toContain('overflow-x-hidden');
    expect(markup).not.toContain('data-scene-shot-rail="true"');
    expect(markup).not.toContain('flex-nowrap');
    expect(markup).not.toContain('Default path');
  });

  it('delegates manual Groups to the spatial renderer instead of the summary-card path', () => {
    const group = {
      ...buildCanvasNode({
        type: 'group',
        position: { x: 0, y: 0 },
        zIndex: 0,
        data: { label: 'Review Group' },
      }),
      id: 'group-1',
      container: { policy: 'group', childIds: ['note-1', 'media-1'] },
    } as CanvasNode;
    const note = {
      ...buildCanvasNode({
        type: 'annotation',
        position: { x: 20, y: 20 },
        zIndex: 1,
        data: { content: 'Check the second beat before exporting.' },
      }),
      id: 'note-1',
      parentId: 'group-1',
    } as CanvasNode;
    const media = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 40, y: 40 },
        zIndex: 2,
        preset: 'media.basic',
        data: { assetPath: 'assets/ref.png', mediaType: 'image' },
      }),
      id: 'media-1',
      parentId: 'group-1',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      React.createElement(NodeContentDispatcher, {
        context: createContext(group, [group, note, media]),
        renderDefaultNode: () => React.createElement('div', null, 'Default path'),
      }),
    );

    expect(markup).toContain('Default path');
    expect(markup).not.toContain('data-child-slot-id="group-children"');
    expect(markup).not.toContain('data-group-review-surface="true"');
  });

  it('covers migrated core preset render parity surfaces', () => {
    const nodes = [
      {
        ...buildCanvasNode({
          type: 'shot',
          position: { x: 0, y: 0 },
          zIndex: 0,
          preset: 'shot.basic',
          data: {
            shotNumber: 5,
            visualDescription: 'Door opens',
            duration: 3,
            generationStatus: 'done',
            generationHistory: [
              {
                id: 'candidate-1',
                dataUrl: 'data:image/png;base64,shot',
                prompt: 'door',
                timestamp: 1,
                selected: true,
              },
            ],
          },
        }),
        id: 'shot-parity',
      },
      {
        ...buildCanvasNode({
          type: 'scene',
          position: { x: 0, y: 260 },
          zIndex: 0,
          preset: 'scene.basic',
          data: { sceneTitle: 'Arrival', sceneNumber: 1, location: 'Station' },
        }),
        id: 'scene-parity',
      },
      {
        ...buildCanvasNode({
          type: 'gallery',
          position: { x: 320, y: 0 },
          zIndex: 0,
          preset: 'gallery.basic',
          data: {
            characterName: 'Mika',
            cells: [
              {
                id: 'front',
                label: 'front',
                image: 'data:image/png;base64,front',
                generationStatus: 'done',
              },
            ],
          },
        }),
        id: 'gallery-parity',
      },
      {
        ...buildCanvasNode({
          type: 'media',
          position: { x: 320, y: 260 },
          zIndex: 0,
          preset: 'media.basic',
          data: { assetPath: 'assets/ref.png', mediaType: 'image' },
        }),
        id: 'media-parity',
      },
      {
        ...buildCanvasNode({
          type: 'group',
          position: { x: 640, y: 0 },
          zIndex: 0,
          data: { label: 'Review' },
        }),
        id: 'group-parity',
      },
      {
        ...buildCanvasNode({
          type: 'project',
          position: { x: 640, y: 260 },
          zIndex: 0,
          data: {
            projectPath: 'projects/demo.nkv',
            projectTitle: 'Cut Demo',
            projectType: 'nkv',
          },
        }),
        id: 'project-parity',
      },
    ] as CanvasNode[];

    const markup = nodes
      .map((node) =>
        renderToStaticMarkup(
          React.createElement(NodeContentDispatcher, {
            context: createContext(node, nodes),
            renderDefaultNode: () => React.createElement('div', null, 'Default path'),
          }),
        ),
      )
      .join('\n');

    expect(markup).toContain('data-node-id="shot-parity"');
    expect(markup).toContain('data-shot-canvas-review-surface="true"');
    expect(markup).toContain('data-shot-canvas-review-preview="true"');
    expect(markup).toContain('data:image/png;base64,shot');
    expect(markup).toContain('data-shot-canvas-review-field="duration"');
    expect(markup).not.toContain('data-content-block-id="shot-status"');
    expect(markup).not.toContain('data-content-block-id="shot-visual-description"');
    expect(markup).not.toContain('data-container-section-id="shot-controls"');
    expect(markup).toContain('data-node-id="scene-parity"');
    expect(markup).toContain('No children');
    expect(markup).toContain('data-content-block-id="scene-title"');
    expect(markup).toContain('data-node-id="gallery-parity"');
    expect(markup).toContain('No views (drag media here)');
    expect(markup).not.toContain('data-content-block-id="gallery-global-prompt"');
    expect(markup).not.toContain('Character Profile');
    expect(markup).toContain('data-node-id="media-parity"');
    expect(markup).toContain('data-node-id="media-parity" data-node-presentation="foundational"');
    expect(markup).toContain('data-content-block-id="media-asset-preview"');
    expect(markup).not.toContain('data-group-review-surface="true"');
    expect(markup).not.toContain('data-child-slot-id="group-children"');
    expect(markup).toContain('No children');
    expect(markup).toContain('data-node-id="project-parity"');
    expect(markup).toContain('data-node-id="scene-parity" data-node-presentation="structured"');
    expect(markup).toContain('data-content-block-id="project-asset-preview"');
    expect(markup).toContain('Default path');
  });
});

function readClassName(markup: string, attribute: string, value: string): string {
  const openingTag = markup.match(new RegExp(`<[^>]*${attribute}="${value}"[^>]*>`));
  expect(openingTag, `Expected ${attribute}="${value}" in rendered markup`).not.toBeNull();
  return openingTag?.[0].match(/class="([^"]*)"/)?.[1] ?? '';
}

function createOverlayRenderContext(node: CanvasNode): NodeContentRenderContext {
  return {
    node,
    allNodes: [node],
    selectedNodeIds: [node.id],
    isSelected: true,
    isExpanded: true,
    layout: {
      width: 1200,
      height: 720,
      density: 'expanded',
      surface: 'overlay',
      overflow: 'scroll',
    },
    depth: 0,
    previewSurfaceKind: 'overlay',
  };
}

function createCanvasContentRenderContext(node: CanvasNode): NodeContentRenderContext {
  return {
    node,
    allNodes: [node],
    selectedNodeIds: [node.id],
    isSelected: true,
    isExpanded: true,
    layout: {
      width: 720,
      height: 420,
      density: 'expanded',
      surface: 'canvas',
      overflow: 'scroll',
    },
    depth: 0,
    previewSurfaceKind: 'inline',
  };
}

function actionTarget(
  actionId: CanvasStoryboardActionIntentId,
): CanvasStoryboardNextCreativeStateTarget {
  switch (actionId) {
    case 'process-reference':
      return 'reference-media';
    case 'optimize-image-prompt':
    case 'generate-image':
      return 'image-prompt';
    case 'optimize-video-prompt':
    case 'generate-video':
      return 'video-prompt';
    case 'review-result':
    case 'accept-result':
    case 'retry':
      return 'result-review';
    case 'fix-alignment':
      return 'prompt-alignment';
  }
}
