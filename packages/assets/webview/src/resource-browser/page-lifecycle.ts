import type { ResourceBrowserFacet } from '@neko/assets-domain/resource-browser/contract';

export type ResourceBrowserPageLifecycle = 'hot-retained' | 'suspendable' | 'ephemeral';

export type ResourceBrowserPageInstance =
  | {
      readonly pageId: string;
      readonly kind: 'facet';
      readonly facet: ResourceBrowserFacet;
      readonly lifecycle: 'hot-retained';
    }
  | {
      readonly pageId: string;
      readonly kind: 'detail';
      readonly facet: ResourceBrowserFacet;
      readonly resourceId: string;
      readonly lifecycle: 'hot-retained';
    }
  | {
      readonly pageId: string;
      readonly kind: 'preview';
      readonly previewSessionId: string;
      readonly lifecycle: 'suspendable';
    }
  | {
      readonly pageId: string;
      readonly kind: 'dialog';
      readonly invocationId: string;
      readonly lifecycle: 'ephemeral';
    };

export interface ResourceBrowserPageCatalog {
  readonly ownerId: string;
  readonly pages: readonly ResourceBrowserPageInstance[];
  readonly activeFacetPageId: string;
  readonly activeDetailPageId?: string;
  readonly activePreviewPageId?: string;
  readonly activeDialogPageId?: string;
}

export interface ResourceBrowserPageRestoreResult {
  readonly catalog: ResourceBrowserPageCatalog;
  readonly diagnostics: readonly string[];
}

const FACETS = [
  'files',
  'media',
  'assets',
  'entities',
] as const satisfies readonly ResourceBrowserFacet[];

export function createResourceBrowserPageCatalog(
  ownerId: string,
  activeFacet: ResourceBrowserFacet = 'files',
): ResourceBrowserPageCatalog {
  const exactOwnerId = requireIdentity(ownerId, 'Resource Browser owner');
  return {
    ownerId: exactOwnerId,
    pages: FACETS.map((facet) => facetPage(facet)),
    activeFacetPageId: facetPageId(activeFacet),
  };
}

export function activateResourceBrowserFacet(
  catalog: ResourceBrowserPageCatalog,
  facet: ResourceBrowserFacet,
): ResourceBrowserPageCatalog {
  const pageId = facetPageId(facet);
  if (!catalog.pages.some((page) => page.pageId === pageId)) {
    throw new Error(`Resource Browser Facet page '${pageId}' is unavailable.`);
  }
  return catalog.activeFacetPageId === pageId ? catalog : { ...catalog, activeFacetPageId: pageId };
}

export function openResourceBrowserDetail(
  catalog: ResourceBrowserPageCatalog,
  facet: ResourceBrowserFacet,
  resourceId: string,
): ResourceBrowserPageCatalog {
  const exactResourceId = requireIdentity(resourceId, 'Resource');
  const pageId = detailPageId(facet, exactResourceId);
  if (
    catalog.activeDetailPageId === pageId &&
    catalog.pages.some((page) => page.pageId === pageId)
  ) {
    return catalog;
  }
  const detail: ResourceBrowserPageInstance = {
    pageId,
    kind: 'detail',
    facet,
    resourceId: exactResourceId,
    lifecycle: 'hot-retained',
  };
  const pages: readonly ResourceBrowserPageInstance[] = catalog.pages.some(
    (page) => page.pageId === pageId,
  )
    ? catalog.pages
    : [...catalog.pages, detail];
  return { ...catalog, pages, activeDetailPageId: pageId };
}

export function openResourceBrowserPreview(
  catalog: ResourceBrowserPageCatalog,
  previewSessionId: string,
): ResourceBrowserPageCatalog {
  const exactPreviewSessionId = requireIdentity(previewSessionId, 'Preview session');
  const pageId = `preview:${exactPreviewSessionId}`;
  if (
    catalog.activePreviewPageId === pageId &&
    catalog.pages.some((page) => page.pageId === pageId)
  ) {
    return catalog;
  }
  const preview: ResourceBrowserPageInstance = {
    pageId,
    kind: 'preview',
    previewSessionId: exactPreviewSessionId,
    lifecycle: 'suspendable',
  };
  const pages: readonly ResourceBrowserPageInstance[] = catalog.pages.some(
    (page) => page.pageId === pageId,
  )
    ? catalog.pages
    : [...catalog.pages, preview];
  return { ...catalog, pages, activePreviewPageId: pageId };
}

export function openResourceBrowserDialog(
  catalog: ResourceBrowserPageCatalog,
  invocationId: string,
): ResourceBrowserPageCatalog {
  const exactInvocationId = requireIdentity(invocationId, 'Dialog invocation');
  const pageId = `dialog:${exactInvocationId}`;
  if (catalog.activeDialogPageId === pageId) return catalog;
  return {
    ...catalog,
    pages: [
      ...catalog.pages.filter((page) => page.kind !== 'dialog'),
      { pageId, kind: 'dialog', invocationId: exactInvocationId, lifecycle: 'ephemeral' },
    ],
    activeDialogPageId: pageId,
  };
}

export function closeResourceBrowserPage(
  catalog: ResourceBrowserPageCatalog,
  pageId: string,
): ResourceBrowserPageCatalog {
  if (pageId === catalog.activeFacetPageId) {
    throw new Error('An active Resource Browser Facet page cannot be closed.');
  }
  if (!catalog.pages.some((page) => page.pageId === pageId)) return catalog;
  const { activeDetailPageId, activePreviewPageId, activeDialogPageId, ...base } = catalog;
  return {
    ...base,
    pages: catalog.pages.filter((page) => page.pageId !== pageId),
    ...(activeDetailPageId === pageId || activeDetailPageId === undefined
      ? {}
      : { activeDetailPageId }),
    ...(activePreviewPageId === pageId || activePreviewPageId === undefined
      ? {}
      : { activePreviewPageId }),
    ...(activeDialogPageId === pageId || activeDialogPageId === undefined
      ? {}
      : { activeDialogPageId }),
  };
}

export function reconcileResourceBrowserDetails(
  catalog: ResourceBrowserPageCatalog,
  facet: ResourceBrowserFacet,
  availableResourceIds: ReadonlySet<string>,
): ResourceBrowserPageCatalog {
  const removed = catalog.pages.filter(
    (page) =>
      page.kind === 'detail' && page.facet === facet && !availableResourceIds.has(page.resourceId),
  );
  return removed.reduce((current, page) => closeResourceBrowserPage(current, page.pageId), catalog);
}

export function restoreResourceBrowserPageCatalog(
  ownerId: string,
  children: readonly unknown[],
  activeFacet: ResourceBrowserFacet,
): ResourceBrowserPageRestoreResult {
  let catalog = createResourceBrowserPageCatalog(ownerId, activeFacet);
  const diagnostics: string[] = [];
  for (const [index, child] of children.entries()) {
    try {
      const record = requireRecord(child);
      if (record['kind'] === 'detail') {
        catalog = openResourceBrowserDetail(
          catalog,
          requireFacet(record['facet']),
          requireIdentity(record['resourceId'], 'Resource'),
        );
      } else if (record['kind'] === 'preview') {
        catalog = openResourceBrowserPreview(
          catalog,
          requireIdentity(record['previewSessionId'], 'Preview session'),
        );
      } else {
        throw new Error('unsupported child kind');
      }
    } catch (error: unknown) {
      diagnostics.push(`Resource Browser child ${index} is invalid: ${describeError(error)}`);
    }
  }
  return { catalog, diagnostics };
}

function facetPage(facet: ResourceBrowserFacet): ResourceBrowserPageInstance {
  return { pageId: facetPageId(facet), kind: 'facet', facet, lifecycle: 'hot-retained' };
}

function facetPageId(facet: ResourceBrowserFacet): string {
  return `facet:${requireFacet(facet)}`;
}

function detailPageId(facet: ResourceBrowserFacet, resourceId: string): string {
  return `detail:${facet}:${resourceId}`;
}

function requireFacet(value: unknown): ResourceBrowserFacet {
  if (typeof value !== 'string' || !FACETS.includes(value as ResourceBrowserFacet)) {
    throw new Error('Resource Browser Facet is invalid.');
  }
  return value as ResourceBrowserFacet;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity is required.`);
  }
  return value;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('child must be an object');
  }
  return value as Record<string, unknown>;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
