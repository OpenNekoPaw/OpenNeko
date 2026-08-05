import { describe, expect, it } from 'vitest';
import {
  closeCanvasNodeChild,
  createCanvasNodeChildCatalog,
  deactivateCanvasNodeInspector,
  openCanvasNodeDialog,
  openCanvasNodeInspector,
  openCanvasNodeMediaPreview,
  reconcileCanvasNodeChildren,
  restoreCanvasNodeChildCatalog,
} from './node-lifecycle';

describe('Canvas node child lifecycle', () => {
  it('deactivates an Inspector without releasing its retained child instance', () => {
    const opened = openCanvasNodeInspector(createCanvasNodeChildCatalog('canvas:1'), 'node:1');
    const inactive = deactivateCanvasNodeInspector(opened);
    const reopened = openCanvasNodeInspector(inactive, 'node:1');

    expect(inactive.activeInspectorId).toBeUndefined();
    expect(inactive.children).toEqual(opened.children);
    expect(reopened.children).toEqual(opened.children);
    expect(reopened.activeInspectorId).toBe('inspector:node:1');
  });

  it('retains sibling inspectors and deletes only children owned by the removed node', () => {
    let catalog = createCanvasNodeChildCatalog('canvas:board-1');
    catalog = openCanvasNodeInspector(catalog, 'node:1');
    catalog = openCanvasNodeInspector(catalog, 'node:2');
    catalog = openCanvasNodeMediaPreview(catalog, 'node:2');

    const reconciled = reconcileCanvasNodeChildren(catalog, new Set(['node:2']));

    expect(reconciled.children.map((child) => child.childId)).not.toContain('inspector:node:1');
    expect(reconciled.children.map((child) => child.childId)).toEqual([
      'inspector:node:2',
      'media-preview:node:2',
    ]);
  });

  it('resets an ephemeral invocation after exact close', () => {
    const opened = openCanvasNodeDialog(createCanvasNodeChildCatalog('canvas:board-1'), 'export:1');
    const closed = closeCanvasNodeChild(opened, 'dialog:export:1');
    const reopened = openCanvasNodeDialog(closed, 'export:2');

    expect(closed.children).toEqual([]);
    expect(reopened.activeDialogId).toBe('dialog:export:2');
  });

  it('retains valid siblings when one restored child is invalid', () => {
    const restored = restoreCanvasNodeChildCatalog('canvas:board-1', [
      { kind: 'inspector', nodeId: 'node:1' },
      { kind: 'unknown', nodeId: 'broken' },
      { kind: 'media-preview', nodeId: 'node:2' },
    ]);

    expect(restored.diagnostics).toHaveLength(1);
    expect(restored.catalog.children.map((child) => child.childId)).toEqual([
      'inspector:node:1',
      'media-preview:node:2',
    ]);
  });
});
