import * as vscode from 'vscode';
import { projectMessagesForResourceDisplay, projectResourceValue } from '@neko/agent/runtime';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import {
  createManagedDocumentResourceRef,
  projectDocumentResourceRefsInValue,
  readDocumentArchiveResourceProjection,
} from '@neko/content/document';
import {
  contentLocatorKey,
  validateContentLocator,
  type DocumentArchiveResourceRef,
  type ResourceRef,
  type ResourceVariantRequest,
} from '@neko/shared';
import type { ConversationProjectionAttachmentHostFrame, Message } from '@neko-agent/types';
import type { AgentLocalResourceAccess } from '../../services/localResourceAccess';
import { getLogger } from '../../base';

const logger = getLogger('WebviewResourceProjection');
const MAX_WEBVIEW_IMAGE_PREVIEW_SOURCE_BYTES = 20 * 1024 * 1024;
const WEBVIEW_IMAGE_PREVIEW_LONG_EDGE = 240;

export interface WebviewResourceProjectionOptions {
  readonly webview: vscode.Webview;
  readonly localResourceAccess?: AgentLocalResourceAccess;
  readonly contentAccessRuntime?: AgentContentAccessRuntime;
  readonly localMediaCaller: string;
  readonly documentResourceCaller: string;
  readonly resolveDocumentResourceScope?: () => ResourceRef['scope'];
}

interface AsyncResourceProjector {
  readonly resolveLocalMediaPath: (filePath: string) => string | undefined;
  readonly projectDocumentResourceRef: (
    ref: DocumentArchiveResourceRef,
    variant: ResourceVariantRequest,
  ) => Promise<string | undefined>;
}

export async function projectMessagesForWebviewResourceDisplay(
  messages: readonly Message[],
  options: WebviewResourceProjectionOptions,
): Promise<Message[]> {
  const projector = createWebviewResourceProjector(options);
  const projected = projectMessagesForResourceDisplay(messages, {
    resolveLocalMediaPath: projector.resolveLocalMediaPath,
  });
  const webviewReadyInput = stripDocumentResourceRuntimeFields(projected);
  const withDocumentResources = await projectDocumentResourceRefsInValue(webviewReadyInput, {
    project: (ref, variant) => projector.projectDocumentResourceRef(ref, variant),
    onMissingProjection: appendResourceProjectionDiagnostic,
  });
  const withPreviews = await projectPerceptualAssetPreviewsInValue(
    withDocumentResources,
    options.contentAccessRuntime,
  );
  return Array.isArray(withPreviews) ? (withPreviews as Message[]) : projected;
}

/**
 * Projects only render payloads at the Webview attachment boundary. Attachment
 * identity, ordering, diagnostics, and detach frames remain host authoritative.
 */
export async function projectConversationProjectionAttachmentFrameForWebview(
  frame: ConversationProjectionAttachmentHostFrame,
  options: WebviewResourceProjectionOptions,
): Promise<unknown> {
  if (frame.type === 'projectionSnapshot') {
    return {
      ...frame,
      projection: await projectValueForWebviewResourceDisplay(frame.projection, options),
    };
  }
  if (frame.type === 'projectionPatch') {
    return {
      ...frame,
      patch: await projectValueForWebviewResourceDisplay(frame.patch, options),
    };
  }
  return frame;
}

export async function projectValueForWebviewResourceDisplay(
  value: unknown,
  options: WebviewResourceProjectionOptions,
): Promise<unknown> {
  const projector = createWebviewResourceProjector(options);
  const projected = projectResourceValue(value, {
    resolveLocalMediaPath: projector.resolveLocalMediaPath,
  });
  const withDocumentResources = await projectDocumentResourceRefsInValue(
    stripDocumentResourceRuntimeFields(projected),
    {
      project: (ref, variant) => projector.projectDocumentResourceRef(ref, variant),
      onMissingProjection: appendResourceProjectionDiagnostic,
    },
  );
  return projectPerceptualAssetPreviewsInValue(withDocumentResources, options.contentAccessRuntime);
}

async function projectPerceptualAssetPreviewsInValue(
  value: unknown,
  contentAccessRuntime: AgentContentAccessRuntime | undefined,
): Promise<unknown> {
  const cache = new Map<string, Promise<{ previewUri?: string; previewDiagnostic?: string }>>();
  const projectAssetRef = async (assetRef: Record<string, unknown>): Promise<unknown> => {
    const locatorResult = validateContentLocator(assetRef['contentLocator']);
    const isPerceptualAsset =
      typeof assetRef['assetId'] === 'string' &&
      typeof assetRef['uri'] === 'string' &&
      typeof assetRef['mimeType'] === 'string';
    if (!isPerceptualAsset || !locatorResult.ok) return assetRef;
    if (!contentAccessRuntime) {
      return {
        ...assetRef,
        previewDiagnostic: 'Webview image preview requires AgentContentAccessRuntime.',
      };
    }
    const key = contentLocatorKey(locatorResult.locator);
    let preview = cache.get(key);
    if (!preview) {
      preview = createContentLocatorPreview(locatorResult.locator, contentAccessRuntime);
      cache.set(key, preview);
    }
    return { ...assetRef, ...(await preview) };
  };
  const project = async (item: unknown, allowPerceptionFallback = true): Promise<unknown> => {
    if (Array.isArray(item)) {
      return Promise.all(item.map((child) => project(child, allowPerceptionFallback)));
    }
    if (!isRecord(item)) return item;
    const hasImageAttachments =
      Array.isArray(item['attachments']) && item['attachments'].some(isImageToolResultAttachment);
    const projectedEntries = await Promise.all(
      Object.entries(item).map(
        async ([key, child]) =>
          [
            key,
            await project(
              child,
              key === 'perceptionCards'
                ? allowPerceptionFallback && !hasImageAttachments
                : allowPerceptionFallback,
            ),
          ] as const,
      ),
    );
    const projected = Object.fromEntries(projectedEntries);
    const assetRef =
      item['type'] === 'image' && isRecord(item['assetRef']) ? item['assetRef'] : undefined;
    if (assetRef) {
      return {
        ...projected,
        assetRef: await projectAssetRef(asRecord(projected['assetRef'])),
      };
    }
    if (
      allowPerceptionFallback &&
      item['modality'] === 'image' &&
      isRecord(item['perceptual']) &&
      isRecord(item['perceptual']['thumbnailRef'])
    ) {
      const perceptual = asRecord(projected['perceptual']);
      return {
        ...projected,
        perceptual: {
          ...perceptual,
          thumbnailRef: await projectAssetRef(asRecord(perceptual['thumbnailRef'])),
        },
      };
    }
    return projected;
  };
  return project(value);
}

function isImageToolResultAttachment(value: unknown): boolean {
  return isRecord(value) && value['type'] === 'image' && isRecord(value['assetRef']);
}

async function createContentLocatorPreview(
  locator: import('@neko/shared').ContentLocator,
  contentAccessRuntime: AgentContentAccessRuntime,
): Promise<{ previewUri?: string; previewDiagnostic?: string }> {
  try {
    const loaded = await contentAccessRuntime.loadContentAsset({
      locator,
      maxBytes: MAX_WEBVIEW_IMAGE_PREVIEW_SOURCE_BYTES,
    });
    if (loaded.status !== 'ready' || !loaded.bytes) {
      return {
        previewDiagnostic:
          loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
          `Image preview is unavailable: ${loaded.status}.`,
      };
    }
    const sharp = (await import('sharp')).default;
    const preview = await sharp(loaded.bytes)
      .rotate()
      .resize({
        width: WEBVIEW_IMAGE_PREVIEW_LONG_EDGE,
        height: WEBVIEW_IMAGE_PREVIEW_LONG_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 74 })
      .toBuffer();
    return { previewUri: `data:image/webp;base64,${preview.toString('base64')}` };
  } catch (error) {
    logger.warn('Failed to project ContentLocator image preview for Webview display', { error });
    return {
      previewDiagnostic: error instanceof Error ? error.message : String(error),
    };
  }
}

function createWebviewResourceProjector(
  options: WebviewResourceProjectionOptions,
): AsyncResourceProjector {
  return {
    resolveLocalMediaPath: (filePath) =>
      options.localResourceAccess?.toWebviewUri(
        options.webview,
        filePath,
        options.localMediaCaller,
      ),
    projectDocumentResourceRef: (ref, variant) =>
      projectDocumentResourceRefForWebview(options, ref, variant),
  };
}

async function projectDocumentResourceRefForWebview(
  options: WebviewResourceProjectionOptions,
  ref: DocumentArchiveResourceRef,
  variant: ResourceVariantRequest,
): Promise<string | undefined> {
  if (!options.contentAccessRuntime) return undefined;
  const managedRef = createManagedDocumentResourceRef(
    ref,
    options.resolveDocumentResourceScope?.() ?? resolveDefaultDocumentResourceScope(),
  );
  try {
    const result = await options.contentAccessRuntime.loadProviderAsset({
      source: managedRef,
      ...(variant.mimeType ? { mimeTypeHint: variant.mimeType } : {}),
    });
    if (result.status !== 'ready' || !result.bytes || !result.mimeType) return undefined;
    return `data:${result.mimeType};base64,${Buffer.from(result.bytes).toString('base64')}`;
  } catch (error) {
    logger.warn('Failed to project document resource for Webview display', { error });
    return undefined;
  }
}

function appendResourceProjectionDiagnostic(
  projected: Record<string, unknown>,
  field: string,
): void {
  const diagnostics = Array.isArray(projected['resourceProjectionDiagnostics'])
    ? [...projected['resourceProjectionDiagnostics']]
    : [];
  diagnostics.push({
    code: 'resource-projection-denied',
    severity: 'error',
    field,
    message:
      'Document resource could not be projected for Webview display. Use ResourceRef through unified content access.',
  });
  projected['resourceProjectionDiagnostics'] = diagnostics;
}

function stripDocumentResourceRuntimeFields(value: unknown): unknown {
  return stripDocumentResourceRuntimeFieldsInner(value, new WeakSet<object>());
}

function stripDocumentResourceRuntimeFieldsInner(
  value: unknown,
  visited: WeakSet<object>,
): unknown {
  if (!isObject(value)) return value;
  if (visited.has(value)) return value;
  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => stripDocumentResourceRuntimeFieldsInner(item, visited));
  }

  if (!isRecord(value)) return value;
  const hasDocumentResource = readDocumentArchiveResourceProjection(value) !== undefined;
  const projected: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (hasDocumentResource && isDocumentResourceRuntimeField(key)) {
      continue;
    }
    projected[key] = stripDocumentResourceRuntimeFieldsInner(child, visited);
  }
  return projected;
}

function isDocumentResourceRuntimeField(key: string): boolean {
  return key === 'renderUri' || key === 'src' || key === 'path';
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function resolveDefaultDocumentResourceScope(): ResourceRef['scope'] {
  return vscode.workspace.workspaceFolders?.[0] ? 'project' : 'extension-private';
}
