export type CanvasNodeChildLifecycle = 'hot-retained' | 'suspendable' | 'ephemeral';

export type CanvasNodeChildInstance =
  | {
      readonly childId: string;
      readonly kind: 'inspector' | 'editor';
      readonly nodeId: string;
      readonly lifecycle: 'hot-retained';
    }
  | {
      readonly childId: string;
      readonly kind: 'media-preview';
      readonly nodeId: string;
      readonly lifecycle: 'suspendable';
    }
  | {
      readonly childId: string;
      readonly kind: 'dialog';
      readonly invocationId: string;
      readonly lifecycle: 'ephemeral';
    };

export interface CanvasNodeChildCatalog {
  readonly canvasOwnerId: string;
  readonly children: readonly CanvasNodeChildInstance[];
  readonly activeInspectorId?: string;
  readonly activeMediaPreviewId?: string;
  readonly activeDialogId?: string;
}

export interface CanvasNodeChildRestoreResult {
  readonly catalog: CanvasNodeChildCatalog;
  readonly diagnostics: readonly string[];
}

export function createCanvasNodeChildCatalog(canvasOwnerId: string): CanvasNodeChildCatalog {
  return { canvasOwnerId: requireIdentity(canvasOwnerId, 'Canvas owner'), children: [] };
}

export function openCanvasNodeInspector(
  catalog: CanvasNodeChildCatalog,
  nodeId: string,
): CanvasNodeChildCatalog {
  const exactNodeId = requireIdentity(nodeId, 'Canvas node');
  const childId = `inspector:${exactNodeId}`;
  const inspector: CanvasNodeChildInstance = {
    childId,
    kind: 'inspector',
    nodeId: exactNodeId,
    lifecycle: 'hot-retained',
  };
  const children: readonly CanvasNodeChildInstance[] = catalog.children.some(
    (child) => child.childId === childId,
  )
    ? catalog.children
    : [...catalog.children, inspector];
  return { ...catalog, children, activeInspectorId: childId };
}

export function deactivateCanvasNodeInspector(
  catalog: CanvasNodeChildCatalog,
): CanvasNodeChildCatalog {
  if (catalog.activeInspectorId === undefined) return catalog;
  const { activeInspectorId: _activeInspectorId, ...inactive } = catalog;
  return inactive;
}

export function openCanvasNodeMediaPreview(
  catalog: CanvasNodeChildCatalog,
  nodeId: string,
): CanvasNodeChildCatalog {
  const exactNodeId = requireIdentity(nodeId, 'Canvas node');
  const childId = `media-preview:${exactNodeId}`;
  const preview: CanvasNodeChildInstance = {
    childId,
    kind: 'media-preview',
    nodeId: exactNodeId,
    lifecycle: 'suspendable',
  };
  const children: readonly CanvasNodeChildInstance[] = catalog.children.some(
    (child) => child.childId === childId,
  )
    ? catalog.children
    : [...catalog.children, preview];
  return { ...catalog, children, activeMediaPreviewId: childId };
}

export function openCanvasNodeDialog(
  catalog: CanvasNodeChildCatalog,
  invocationId: string,
): CanvasNodeChildCatalog {
  const exactInvocationId = requireIdentity(invocationId, 'Canvas dialog invocation');
  const childId = `dialog:${exactInvocationId}`;
  return {
    ...catalog,
    children: [
      ...catalog.children.filter((child) => child.kind !== 'dialog'),
      { childId, kind: 'dialog', invocationId: exactInvocationId, lifecycle: 'ephemeral' },
    ],
    activeDialogId: childId,
  };
}

export function closeCanvasNodeChild(
  catalog: CanvasNodeChildCatalog,
  childId: string,
): CanvasNodeChildCatalog {
  if (!catalog.children.some((child) => child.childId === childId)) return catalog;
  const { activeInspectorId, activeMediaPreviewId, activeDialogId, ...base } = catalog;
  return {
    ...base,
    children: catalog.children.filter((child) => child.childId !== childId),
    ...(activeInspectorId === childId || activeInspectorId === undefined
      ? {}
      : { activeInspectorId }),
    ...(activeMediaPreviewId === childId || activeMediaPreviewId === undefined
      ? {}
      : { activeMediaPreviewId }),
    ...(activeDialogId === childId || activeDialogId === undefined ? {} : { activeDialogId }),
  };
}

export function reconcileCanvasNodeChildren(
  catalog: CanvasNodeChildCatalog,
  availableNodeIds: ReadonlySet<string>,
): CanvasNodeChildCatalog {
  const removed = catalog.children.filter(
    (child) => child.kind !== 'dialog' && !availableNodeIds.has(child.nodeId),
  );
  return removed.reduce((current, child) => closeCanvasNodeChild(current, child.childId), catalog);
}

export function restoreCanvasNodeChildCatalog(
  canvasOwnerId: string,
  children: readonly unknown[],
): CanvasNodeChildRestoreResult {
  let catalog = createCanvasNodeChildCatalog(canvasOwnerId);
  const diagnostics: string[] = [];
  for (const [index, child] of children.entries()) {
    try {
      const record = requireRecord(child);
      if (record['kind'] === 'inspector') {
        catalog = openCanvasNodeInspector(
          catalog,
          requireIdentity(record['nodeId'], 'Canvas node'),
        );
      } else if (record['kind'] === 'media-preview') {
        catalog = openCanvasNodeMediaPreview(
          catalog,
          requireIdentity(record['nodeId'], 'Canvas node'),
        );
      } else {
        throw new Error('unsupported child kind');
      }
    } catch (error: unknown) {
      diagnostics.push(`Canvas child ${index} is invalid: ${describeError(error)}`);
    }
  }
  return { catalog, diagnostics };
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
