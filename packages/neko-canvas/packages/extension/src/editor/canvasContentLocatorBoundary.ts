import { isContentLocator, type ContentLocator } from '@neko/shared';

export type CanvasContentLocatorProjectionSlot = 'node-content';

export interface CanvasContentLocatorProjectionFailure {
  readonly slot: CanvasContentLocatorProjectionSlot;
  readonly locator: ContentLocator;
}

export async function projectCanvasContentLocatorRuntimeState(
  node: unknown,
  project: (
    locator: ContentLocator,
    slot: CanvasContentLocatorProjectionSlot,
  ) => Promise<string | undefined>,
): Promise<readonly CanvasContentLocatorProjectionFailure[]> {
  const data = readNodeData(node);
  if (!data) return [];

  const failures: CanvasContentLocatorProjectionFailure[] = [];
  const locator = readMigratedLocator(data, 'node-content');
  if (!locator) return failures;
  assertNoRuntimeProjectionFields(data, 'node-content', [
    'runtimeAssetPath',
    'runtimeThumbnailPath',
    'renderUri',
    'providerUrl',
    'base64',
    'dataUrl',
  ]);
  const renderUri = await project(locator, 'node-content');
  if (renderUri) {
    data['runtimeAssetPath'] = renderUri;
    delete data['documentResourceStatus'];
  } else {
    failures.push({ slot: 'node-content', locator });
  }
  return failures;
}

export function stripCanvasContentLocatorRuntimeState(node: unknown): void {
  const data = readNodeData(node);
  if (!data) return;

  if (!readMigratedLocator(data, 'node-content')) return;
  delete data['runtimeAssetPath'];
  delete data['runtimeThumbnailPath'];
  delete data['documentResourceStatus'];
  delete data['renderUri'];
  delete data['providerUrl'];
  delete data['base64'];
  delete data['dataUrl'];
}

function readMigratedLocator(
  value: Record<string, unknown>,
  slot: CanvasContentLocatorProjectionSlot,
): ContentLocator | undefined {
  const contentLocator = value['contentLocator'];
  if (contentLocator === undefined) return undefined;
  if (
    value['resourceRef'] !== undefined ||
    value['documentResourceRef'] !== undefined ||
    value['resourceVariantRef'] !== undefined ||
    value['contentRef'] !== undefined ||
    value['localPath'] !== undefined
  ) {
    throw new Error(
      `canvas-content-locator-migration-required: ${slot} cannot combine contentLocator with legacy content references.`,
    );
  }
  if (
    slot === 'node-content' &&
    ((typeof value['assetPath'] === 'string' && value['assetPath'].length > 0) ||
      (typeof value['docPath'] === 'string' && value['docPath'].length > 0))
  ) {
    throw new Error(
      'canvas-content-locator-migration-required: node-content cannot combine contentLocator with a raw content path.',
    );
  }
  if (!isContentLocator(contentLocator)) {
    throw new Error(`Canvas ${slot} contains an invalid contentLocator.`);
  }
  return contentLocator;
}

function assertNoRuntimeProjectionFields(
  value: Readonly<Record<string, unknown>>,
  slot: CanvasContentLocatorProjectionSlot,
  fields: readonly string[],
): void {
  const field = fields.find((candidate) => value[candidate] !== undefined);
  if (!field) return;
  throw new Error(
    `canvas-content-locator-migration-required: ${slot} persisted runtime field ${field}.`,
  );
}

function readNodeData(node: unknown): Record<string, unknown> | undefined {
  return isRecord(node) && isRecord(node['data']) ? node['data'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
