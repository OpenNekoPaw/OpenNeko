import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CanvasViewport, DocumentCanvasNode, ScriptCanvasNode } from '@neko/shared';
import { DocumentNode } from './DocumentNode';
import { ScriptNode } from './ScriptNode';

(globalThis as { React?: typeof React }).React = React;

const viewport: CanvasViewport = { pan: { x: 0, y: 0 }, zoom: 1 };

describe('Canvas text-like resource nodes', () => {
  it('renders a Markdown file in a full-body low-chrome Document node', () => {
    const node: DocumentCanvasNode = {
      id: 'document-markdown',
      type: 'document',
      position: { x: 0, y: 0 },
      size: { width: 420, height: 360 },
      zIndex: 1,
      data: {
        docPath: 'assets/guide.md',
        docType: 'markdown',
        title: 'guide.md',
      },
    };

    const markup = renderToStaticMarkup(
      <DocumentNode
        node={node}
        viewport={viewport}
        isSelected={false}
        textProjection={{
          status: 'ready',
          requestId: 'read-1',
          docPath: 'assets/guide.md',
          docType: 'markdown',
          text: '# Guide\n\nBody',
        }}
      />,
    );

    expect(markup).toContain('data-node-presentation="foundational"');
    expect(markup).toContain('node-card--opaque');
    expect(markup).toContain('data-document-node-layout="text"');
    expect(markup).toContain('data-document-text-surface="markdown"');
    expect(markup).toContain('<h1');
    expect(markup).not.toContain('>打开<');
    expect(markup).not.toContain('DOC ·');
    expect(markup).not.toContain('borderTop');
  });

  it('shows an explicit Script error without permanent card chrome', () => {
    const node: ScriptCanvasNode = {
      id: 'script-error',
      type: 'script',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      zIndex: 1,
      data: {
        scriptPath: 'scripts/missing.fountain',
        scriptTitle: 'Missing',
        scenes: [],
      },
    };

    const markup = renderToStaticMarkup(
      <ScriptNode
        node={node}
        viewport={viewport}
        isSelected={false}
        indexState={{ status: 'error', error: 'Script source is unavailable.' }}
      />,
    );

    expect(markup).toContain('data-script-node-layout="low-chrome"');
    expect(markup).toContain('node-card--opaque');
    expect(markup).toContain('Script source is unavailable.');
    expect(markup).not.toContain('加载中');
    expect(markup).not.toContain('>打开<');
    expect(markup).not.toContain('>SCRIPT<');
  });

  it('shows an explicit empty Script state', () => {
    const node: ScriptCanvasNode = {
      id: 'script-empty',
      type: 'script',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      zIndex: 1,
      data: {
        scriptPath: 'scripts/empty.fountain',
        scriptTitle: 'Empty',
        scenes: [],
      },
    };

    const markup = renderToStaticMarkup(
      <ScriptNode
        node={node}
        viewport={viewport}
        isSelected={false}
        indexState={{ status: 'empty' }}
      />,
    );

    expect(markup).toContain('剧本中没有可索引的场景。');
    expect(markup).not.toContain('正在读取剧本');
  });
});
