// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import narrativeRegistration from './narrative';
import { createNarrativeNodeTypeDescriptors } from './narrative/descriptors';
import { createNarrativeNodeRendererRegistry } from './narrative/renderers';
import { FloatingPanelHost } from '../components/panels/FloatingPanelHost';
import { renderCanvasNode } from '../components/nodes/nodeRendererRegistry';
import { resolveNarrativePlaybackState } from './narrative/NarrativePlaybackController';
import NarrativeVariablesPanel from './narrative/NarrativeVariablesPanel';
import { setLocale } from '../i18n';
import { useCanvasStore } from '../stores/canvasStore';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('narrative subsystem panel metadata', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useCanvasStore.setState({
      canvasData: null,
      selection: { nodeIds: [], connectionIds: [] },
      isConnecting: false,
      pendingConnectionSource: null,
      activePlayingNodeId: null,
      expandedNodeId: null,
      generationPanelState: { visible: false, nodeId: null, childNodeId: null },
      contentOverlayState: { visible: false, nodeId: null },
    });
    setLocale('en');
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('localizes floating panel titles through titleKey metadata', () => {
    setLocale('zh-cn');
    const markup = renderToStaticMarkup(
      React.createElement(FloatingPanelHost, {
        panels: narrativeRegistration.floatingPanels ?? [],
      }),
    );
    setLocale('en');

    expect(narrativeRegistration.floatingPanels?.[0]?.titleKey).toBe(
      'panel.narrativeVariables.title',
    );
    expect(markup).toContain('叙事变量');
    expect(markup).not.toContain('Narrative Variables');
  });

  it('registers start and ending narrative node descriptors and renderers', () => {
    const descriptors = createNarrativeNodeTypeDescriptors();
    const renderers = createNarrativeNodeRendererRegistry();

    expect(descriptors['narrative-start']).toMatchObject({
      labelKey: 'node.narrativeStart',
      tagLabel: 'START',
      defaultSize: { width: 200, height: 100 },
    });
    expect(descriptors['narrative-ending']).toMatchObject({
      labelKey: 'node.narrativeEnding',
      tagLabel: 'ENDING',
      defaultSize: { width: 220, height: 110 },
    });
    expect(renderers['narrative-start']).toBeTypeOf('function');
    expect(renderers['narrative-ending']).toBeTypeOf('function');
  });

  it('renders narrative start and ending nodes without unsupported cards', () => {
    const renderers = createNarrativeNodeRendererRegistry();
    const startMarkup = renderToStaticMarkup(
      renderCanvasNode(renderers, {
        node: {
          id: 'start',
          type: 'narrative-start',
          position: { x: 0, y: 0 },
          size: { width: 200, height: 100 },
          zIndex: 1,
          data: { label: 'Opening' },
        },
        allNodes: [],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );
    const endingMarkup = renderToStaticMarkup(
      renderCanvasNode(renderers, {
        node: {
          id: 'ending',
          type: 'narrative-ending',
          position: { x: 0, y: 0 },
          size: { width: 220, height: 110 },
          zIndex: 1,
          data: { endingLabel: 'True Ending', summary: 'All paths resolved.' },
        },
        allNodes: [],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );

    expect(startMarkup).toContain('START');
    expect(startMarkup).toContain('Opening');
    expect(startMarkup).not.toContain('UNSUPPORTED');
    expect(endingMarkup).toContain('ENDING');
    expect(endingMarkup).toContain('True Ending');
    expect(endingMarkup).toContain('All paths resolved.');
    expect(endingMarkup).not.toContain('UNSUPPORTED');
  });

  it('renders narrative scene nodes as compact Fountain summaries', () => {
    const renderers = createNarrativeNodeRendererRegistry();
    const markup = renderToStaticMarkup(
      renderCanvasNode(renderers, {
        node: {
          id: 'scene',
          type: 'narrative-scene',
          position: { x: 0, y: 0 },
          size: { width: 260, height: 150 },
          zIndex: 1,
          data: {
            title: 'Cafe',
            sceneRef: 'scenes/cafe.fountain',
            summary: 'A quiet meeting with a branching choice.',
          },
        },
        allNodes: [],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );

    expect(markup).toContain('SCENE');
    expect(markup).toContain('Cafe');
    expect(markup).toContain('Fountain scene');
    expect(markup).toContain('scenes/cafe.fountain');
    expect(markup).toContain('A quiet meeting with a branching choice.');
    expect(markup).toContain('Open Fountain');
    expect(markup).not.toContain('UNSUPPORTED');
  });

  it('renders bounded missing and invalid Fountain scene states', () => {
    const renderers = createNarrativeNodeRendererRegistry();
    const missingMarkup = renderToStaticMarkup(
      renderCanvasNode(renderers, {
        node: {
          id: 'missing-scene',
          type: 'narrative-scene',
          position: { x: 0, y: 0 },
          size: { width: 260, height: 150 },
          zIndex: 1,
          data: { title: 'Missing' },
        },
        allNodes: [],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );
    const invalidMarkup = renderToStaticMarkup(
      renderCanvasNode(renderers, {
        node: {
          id: 'invalid-scene',
          type: 'narrative-scene',
          position: { x: 0, y: 0 },
          size: { width: 260, height: 150 },
          zIndex: 1,
          data: { title: 'Legacy', sceneRef: 'scenes/legacy.story' },
        },
        allNodes: [],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );

    expect(missingMarkup).toContain('No .fountain scene linked');
    expect(missingMarkup).not.toContain('Open Fountain');
    expect(invalidMarkup).toContain('scenes/legacy.story');
    expect(invalidMarkup).toContain('Scene ref must be a .fountain file');
    expect(invalidMarkup).not.toContain('Open Fountain');
  });

  it('delegates Fountain scene editing from explicit actions and double-clicks', () => {
    const renderers = createNarrativeNodeRendererRegistry();
    const onScriptOpen = vi.fn();

    act(() => {
      root.render(
        renderCanvasNode(renderers, {
          node: {
            id: 'scene',
            type: 'narrative-scene',
            position: { x: 0, y: 0 },
            size: { width: 260, height: 150 },
            zIndex: 1,
            data: {
              title: 'Cafe',
              sceneRef: 'scenes/cafe.fountain',
              summary: 'A quiet meeting.',
            },
          },
          allNodes: [],
          selectedNodeIds: [],
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          isSelected: false,
          containerRef: { current: null },
          onScriptOpen,
        }),
      );
    });

    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Open Fountain"]');
    expect(button).not.toBeNull();

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onScriptOpen).toHaveBeenCalledWith('scenes/cafe.fountain');

    const sceneNode = host.querySelector<HTMLElement>('[data-node-id="scene"] .flex.h-full');
    expect(sceneNode).not.toBeNull();

    act(() => {
      sceneNode?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(onScriptOpen).toHaveBeenCalledTimes(2);
    expect(onScriptOpen).toHaveBeenLastCalledWith('scenes/cafe.fountain');
  });

  it('keeps narrative variables documented as canvas-level agent context', () => {
    setLocale('zh-cn');
    const markup = renderToStaticMarkup(React.createElement(NarrativeVariablesPanel, {}));
    setLocale('en');

    expect(markup).toContain('画布级故事状态');
    expect(markup).toContain('暂无变量');
  });

  it('enables narrative playback actions when a default path exists', () => {
    const playbackState = resolveNarrativePlaybackState({
      path: ['start', 'choice'],
      selectedNodeId: 'start',
    });

    expect(playbackState).toEqual({
      currentNodeId: 'start',
      currentIndex: 0,
      canStepPrevious: false,
      canStepNext: true,
      canPlay: true,
    });
  });
});
