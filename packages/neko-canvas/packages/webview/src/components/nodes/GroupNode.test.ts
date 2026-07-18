import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { AnnotationCanvasNode, GroupCanvasNode } from '@neko/shared';
import { setLocale } from '../../i18n';
import { GroupNode } from './GroupNode';

describe('GroupNode', () => {
  afterEach(() => setLocale('en'));

  it('renders a semi-transparent spatial frame with a floating name and no child summaries', () => {
    const group: GroupCanvasNode = {
      id: 'group',
      type: 'group',
      position: { x: 0, y: 0 },
      size: { width: 500, height: 400 },
      zIndex: 10,
      container: { policy: 'group', childIds: ['child'] },
      data: { label: 'References' },
    };
    const child: AnnotationCanvasNode = {
      id: 'child',
      type: 'annotation',
      parentId: 'group',
      position: { x: 40, y: 100 },
      size: { width: 120, height: 80 },
      zIndex: 11,
      data: { content: 'Child content must render as its own Canvas node.' },
    };

    const markup = renderToStaticMarkup(
      React.createElement(GroupNode, {
        node: group,
        allNodes: [group, child],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: true,
      }),
    );

    expect(markup).toContain('data-node-presentation="spatial-container"');
    expect(markup).toContain('data-spatial-group-frame="true"');
    expect(markup).toContain('data-spatial-group-label="group"');
    expect(markup).toContain('data-spatial-group-collapse-toggle="group"');
    expect(markup).toContain('data-node-drag-allow="true"');
    expect(markup).toContain('References');
    expect(markup).toContain('>x1<');
    expect(markup).not.toContain('Child content must render as its own Canvas node.');
    expect(markup).not.toContain('data-group-review-surface');
  });

  it('localizes canonical Workspace Board labels while preserving authored names', () => {
    setLocale('zh-cn');
    const inbox = createGroup('workspace-inbox', { label: 'Inbox' });
    const task = createGroup('workspace-process-task-1', {
      label: 'Agent Task task-1',
      provenance: {
        version: 2,
        deliveryId: 'delivery:batch-1',
        taskId: 'task-1',
        sourceHost: 'headless',
        createdAt: '2026-07-18T00:00:00.000Z',
        artifacts: [],
      },
    });
    const freshTask = createGroup('workspace-process-task-3', {
      provenance: {
        version: 2,
        deliveryId: 'delivery:batch-3',
        taskId: 'task-3',
      },
    });
    const authored = createGroup('workspace-process-authored', {
      label: '角色概念探索',
      provenance: {
        version: 2,
        deliveryId: 'delivery:batch-2',
        taskId: 'task-2',
      },
    });

    const markup = [inbox, task, freshTask, authored]
      .map((node) =>
        renderToStaticMarkup(
          React.createElement(GroupNode, {
            node,
            allNodes: [node],
            viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
            isSelected: false,
          }),
        ),
      )
      .join('\n');

    expect(markup).toContain('收件箱');
    expect(markup).toContain('任务 · task-1');
    expect(markup).toContain('任务 · task-3');
    expect(markup).toContain('角色概念探索');
    expect(markup).not.toContain('Agent Task');
  });
});

function createGroup(id: string, data: GroupCanvasNode['data']): GroupCanvasNode {
  return {
    id,
    type: 'group',
    position: { x: 0, y: 0 },
    size: { width: 500, height: 400 },
    zIndex: 10,
    container: { policy: 'group', childIds: [] },
    data,
  };
}
