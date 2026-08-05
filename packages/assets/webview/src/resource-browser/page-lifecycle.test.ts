import { describe, expect, it } from 'vitest';
import {
  activateResourceBrowserFacet,
  closeResourceBrowserPage,
  createResourceBrowserPageCatalog,
  openResourceBrowserDetail,
  openResourceBrowserDialog,
  openResourceBrowserPreview,
  reconcileResourceBrowserDetails,
  restoreResourceBrowserPageCatalog,
} from './page-lifecycle';

describe('Resource Browser page lifecycle', () => {
  it('retains facet/detail siblings and closes only the exact deleted resource', () => {
    let catalog = createResourceBrowserPageCatalog('resource-browser:workspace-1');
    catalog = activateResourceBrowserFacet(catalog, 'entities');
    catalog = openResourceBrowserDetail(catalog, 'entities', 'entity:1');
    catalog = openResourceBrowserDetail(catalog, 'entities', 'entity:2');
    catalog = openResourceBrowserPreview(catalog, 'preview:1');

    const reconciled = reconcileResourceBrowserDetails(catalog, 'entities', new Set(['entity:2']));

    expect(reconciled.pages.map((page) => page.pageId)).not.toContain('detail:entities:entity:1');
    expect(reconciled.pages.map((page) => page.pageId)).toContain('detail:entities:entity:2');
    expect(reconciled.pages.map((page) => page.pageId)).toContain('preview:preview:1');
    expect(reconciled.pages.filter((page) => page.kind === 'facet')).toHaveLength(4);
  });

  it('resets ephemeral dialog invocation state on close', () => {
    const opened = openResourceBrowserDialog(
      createResourceBrowserPageCatalog('resource-browser:workspace-1'),
      'create-directory:1',
    );
    const closed = closeResourceBrowserPage(opened, 'dialog:create-directory:1');
    const reopened = openResourceBrowserDialog(closed, 'create-directory:2');

    expect(closed.pages.some((page) => page.kind === 'dialog')).toBe(false);
    expect(reopened.activeDialogPageId).toBe('dialog:create-directory:2');
  });

  it('rejects one invalid restored child without dropping valid siblings', () => {
    const restored = restoreResourceBrowserPageCatalog(
      'resource-browser:workspace-1',
      [
        { kind: 'detail', facet: 'entities', resourceId: 'entity:1' },
        { kind: 'detail', facet: 'unknown', resourceId: 'broken' },
        { kind: 'preview', previewSessionId: 'preview:1' },
      ],
      'entities',
    );

    expect(restored.diagnostics).toHaveLength(1);
    expect(restored.catalog.pages.map((page) => page.pageId)).toContain('detail:entities:entity:1');
    expect(restored.catalog.pages.map((page) => page.pageId)).toContain('preview:preview:1');
  });
});
