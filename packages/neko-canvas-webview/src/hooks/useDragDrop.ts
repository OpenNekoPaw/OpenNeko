/**
 * useDragDrop - Drag & drop handling for canvas
 *
 * Handles drag-and-drop of files from the Host explorer, native
 * file system, and Media Library into the canvas.
 */

import { useCallback, useRef } from 'react';
import {
  inferCanvasDroppedAssetKind,
  inferCanvasMediaType,
  inferCanvasTextFileFormat,
  type CanvasDroppedAsset,
} from '@neko-canvas/domain';
import {
  createProjectSourceAddClient,
  type ProjectSourceAddClient,
  type ProjectSourceAddClientInput,
  type ProjectSourceAddResult,
} from '@neko/content/project-file-io';
import {
  CONTENT_LOCATOR_DRAG_MIME,
  parseContentLocatorDragData,
  type ContentLocator,
} from '@neko/content';
import { isMediaLibraryDragData } from '@neko-assets/domain/contracts';
import {
  type CanvasMaterialMediaKind,
  type CanvasNodeType,
  type CanvasReferencedContentLocator,
} from '@neko-canvas/domain';
import { useFileDrop } from '@neko/ui/hooks';
import type { FileDropResult } from '@neko/ui/hooks';
import { detectMediaType } from '../utils/mediaType';
import type { CanvasHostMessagePort } from './useCanvasHostMessages';

// =============================================================================
// Types
// =============================================================================

export type CanvasProjectSourceAddClient = ProjectSourceAddClient;

export interface UseDragDropOptions {
  hostPort: CanvasHostMessagePort;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  addMediaAt: (
    pos: { x: number; y: number },
    mediaType: 'image' | 'video' | 'audio',
    uri?: string,
    name?: string,
    options?: { contentLocator: ContentLocator; runtimeAssetPath?: string },
  ) => void;
  onDropAssets?: (assets: CanvasDroppedAsset[], position?: { x: number; y: number }) => void;
  addSourceClient?: ProjectSourceAddClient;
  projectContent?: (
    locator: CanvasReferencedContentLocator,
    mediaKind: CanvasMaterialMediaKind,
    position: { readonly x: number; readonly y: number },
    title?: string,
  ) => Promise<unknown>;
  onError?: (message: string) => void;
}

export interface UseDragDropReturn {
  isDragOver: boolean;
  dropPositionRef: React.MutableRefObject<{ x: number; y: number } | null>;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useDragDrop(options: UseDragDropOptions): UseDragDropReturn {
  const { hostPort, screenToCanvas, addMediaAt, onError } = options;

  const dropPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleFileDrop = useCallback(
    async (result: FileDropResult, event: React.DragEvent) => {
      // Save drop position for when extension responds
      dropPositionRef.current = screenToCanvas(event.clientX, event.clientY);

      if (result.type === 'json' && isContentLocatorDragPayload(result.data)) {
        const position = dropPositionRef.current ?? { x: 0, y: 0 };
        const projectContent = options.projectContent;
        if (!projectContent) {
          onError?.('Canvas Host does not support ContentLocator drops.');
          return;
        }
        try {
          const payload = parseContentLocatorDragData(result.data);
          if (payload.locator.kind === 'generated-output') {
            throw new Error('Generated results require the Generation-owned Canvas commit path.');
          }
          await projectContent(
            payload.locator,
            inferMaterialMediaKind(payload.name),
            position,
            payload.name,
          );
        } catch (error: unknown) {
          onError?.(error instanceof Error ? error.message : String(error));
        }
      } else if (result.type === 'json' && isMediaLibraryDragData(result.data)) {
        const items = result.data.files.map((file) => ({ files: [file] }));
        const addSourceClient =
          options.addSourceClient ?? createCanvasProjectSourceAddClient(hostPort);
        const pos = dropPositionRef.current ?? { x: 0, y: 0 };
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const file = item?.files[0];
          if (file) {
            const dropPos = { x: pos.x + i * 30, y: pos.y + i * 30 };
            const addResult = await addSourceClient.addSource(
              createCanvasAssetAddSourceInput({
                sourcePath: file.path,
                name: file.name,
                mediaType: normalizeCanvasMediaType(file.mediaType),
                dropPosition: dropPos,
              }),
            );
            applyCanvasAddSourceResult({
              result: addResult,
              sourceNameHint: file.name,
              mediaTypeHint: normalizeCanvasMediaType(file.mediaType),
              dropPosition: dropPos,
              addMediaAt,
              onDropAssets: options.onDropAssets,
              onError,
            });
          }
        }
      } else if (result.type === 'uri-list' && result.uris) {
        const addSourceClient =
          options.addSourceClient ?? createCanvasProjectSourceAddClient(hostPort);
        const pos = dropPositionRef.current ?? { x: 0, y: 0 };
        for (let i = 0; i < result.uris.length; i++) {
          const sourceUri = result.uris[i];
          if (!sourceUri) continue;
          const dropPos = { x: pos.x + i * 30, y: pos.y + i * 30 };
          const addResult = await addSourceClient.addSource(
            createCanvasAssetAddSourceInput({
              sourceUri,
              name: sourceUri,
              dropPosition: dropPos,
            }),
          );
          applyCanvasAddSourceResult({
            result: addResult,
            sourceNameHint: sourceUri,
            dropPosition: dropPos,
            addMediaAt,
            onDropAssets: options.onDropAssets,
            onError,
          });
        }
      } else if (result.type === 'native-file' && result.files) {
        const addSourceClient =
          options.addSourceClient ?? createCanvasProjectSourceAddClient(hostPort);
        const pos = dropPositionRef.current;
        for (let i = 0; i < result.files.length; i++) {
          const file = result.files[i];
          if (!file) continue;
          const mediaType = detectMediaType(file.name);
          if (mediaType) {
            const offset = i * 30;
            const dropPos = { x: (pos?.x ?? 0) + offset, y: (pos?.y ?? 0) + offset };
            const result = await addSourceClient.addSource(
              createCanvasMediaAddSourceInput({
                file,
                mediaType,
                dropPosition: dropPos,
              }),
            );
            applyCanvasAddSourceResult({
              result,
              sourceNameHint: file.name,
              mediaTypeHint: mediaType,
              dropPosition: dropPos,
              addMediaAt,
              onDropAssets: options.onDropAssets,
              onError,
            });
          }
        }
      }
    },
    [
      hostPort,
      screenToCanvas,
      addMediaAt,
      options.addSourceClient,
      options.onDropAssets,
      options.projectContent,
      onError,
    ],
  );

  const { isDragOver, dropProps } = useFileDrop(handleFileDrop, {
    structuredMimeTypes: [CONTENT_LOCATOR_DRAG_MIME, 'application/json'],
  });

  // Cross-surface drags can arrive without a browser DataTransfer payload.
  const handleDropWithCrossSurface = useCallback(
    (e: React.DragEvent) => {
      // Let useFileDrop handle file/URI/asset drops first
      const hasExternalDropPayload = hasCanvasExternalDropPayload(e.dataTransfer);
      dropProps.onDrop(e);

      // Ask the Desktop host whether another Webview surface owns a pending payload.
      if (hostPort && !hasExternalDropPayload && (hostPort.supportsMessage?.('dnd:drop') ?? true)) {
        hostPort.postMessage({ type: 'dnd:drop' });
      }
    },
    [dropProps, hostPort],
  );

  return {
    isDragOver,
    dropPositionRef,
    handleDragEnter: dropProps.onDragEnter,
    handleDragOver: dropProps.onDragOver,
    handleDragLeave: dropProps.onDragLeave,
    handleDrop: handleDropWithCrossSurface,
  };
}

function inferMaterialMediaKind(name: string): CanvasMaterialMediaKind {
  const mediaType = inferCanvasMediaType(name);
  if (mediaType) return mediaType;
  const lowerName = name.toLocaleLowerCase();
  if (lowerName.endsWith('.glb') || lowerName.endsWith('.gltf') || lowerName.endsWith('.vrm')) {
    return 'model';
  }
  if (
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.fountain') ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.epub')
  ) {
    return 'document';
  }
  return 'other';
}

function createCanvasAssetAddSourceInput(input: {
  readonly sourcePath?: string;
  readonly sourceUri?: string;
  readonly name: string;
  readonly mediaType?: 'image' | 'video' | 'audio';
  readonly dropPosition: { x: number; y: number };
}): ProjectSourceAddClientInput {
  const fileName = basenameFromSource(input.sourcePath ?? input.sourceUri ?? input.name);
  const assetKind = inferCanvasDroppedAssetKind(fileName);
  const mediaType = input.mediaType ?? inferCanvasMediaType(fileName) ?? undefined;
  const metadata = createCanvasAddSourceMetadata({
    fileName,
    assetKind,
    mediaType,
    dropPosition: input.dropPosition,
  });

  return {
    kind: 'drag-drop',
    formatId: 'nkc',
    ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
    ...(input.sourceUri ? { sourceUri: input.sourceUri } : {}),
    browserFile: { name: fileName },
    target: {
      role:
        metadata.canvasAssetKind === 'canvas'
          ? 'project'
          : metadata.canvasAssetKind === 'file'
            ? 'document'
            : mediaType === 'audio'
              ? 'audio'
              : mediaType === 'image'
                ? 'image'
                : 'media',
    },
    assetDirectory: mediaType ? 'media' : 'assets',
    metadata,
  };
}

export function createCanvasMediaAddSourceInput(input: {
  readonly file: File;
  readonly mediaType: 'image' | 'video' | 'audio';
  readonly dropPosition: { x: number; y: number };
}): ProjectSourceAddClientInput {
  return {
    kind: 'drag-drop',
    formatId: 'nkc',
    file: input.file,
    target: {
      role: input.mediaType === 'audio' ? 'audio' : input.mediaType === 'image' ? 'image' : 'media',
    },
    assetDirectory: 'media',
    metadata: {
      ...createCanvasAddSourceMetadata({
        fileName: input.file.name,
        assetKind: 'media',
        mediaType: input.mediaType,
        dropPosition: input.dropPosition,
      }),
    },
  };
}

export function createCanvasFilePickerAddSourceInput(
  nodeType: CanvasNodeType | undefined,
  dropPosition: { x: number; y: number },
  mediaTypeHint?: 'image' | 'video' | 'audio',
): ProjectSourceAddClientInput {
  const sourceNameHint = getCanvasFilePickerDefaultName(nodeType, mediaTypeHint);
  const assetKind = readCanvasAssetKindForNodeType(nodeType);
  const metadata = createCanvasAddSourceMetadata({
    fileName: sourceNameHint,
    assetKind,
    mediaType: mediaTypeHint,
    dropPosition,
  });

  return {
    kind: 'file-picker',
    formatId: 'nkc',
    browserFile: { name: sourceNameHint },
    target: {
      role: readCanvasSourceRoleForNodeType(nodeType, mediaTypeHint),
    },
    assetDirectory: assetKind === 'media' ? 'media' : 'assets',
    metadata,
  };
}

export function getCanvasFilePickerDefaultName(
  nodeType: CanvasNodeType | undefined,
  mediaTypeHint?: 'image' | 'video' | 'audio',
): string {
  switch (nodeType) {
    case 'media':
      return mediaTypeHint ?? 'media';
    case 'file':
      return 'file';
    case 'canvas-embed':
      return 'canvas.nkc';
    default:
      return 'source';
  }
}

function readCanvasAddSourceMetadata(result: ProjectSourceAddResult): {
  readonly canvasAssetKind?: 'media' | 'text' | 'file' | 'canvas';
  readonly mediaType?: 'image' | 'video' | 'audio';
  readonly runtimeAssetPath?: string;
  readonly name?: string;
  readonly title?: string;
  readonly textFormat?: string;
  readonly textContent?: string;
} {
  const metadata = result.metadata;
  const canvasAssetKind = metadata?.['canvasAssetKind'];
  const mediaType = metadata?.['mediaType'];
  const runtimeAssetPath = metadata?.['runtimeAssetPath'];
  const name = metadata?.['name'];
  const title = metadata?.['title'];
  const textFormat = metadata?.['textFormat'];
  const textContent = metadata?.['textContent'];
  return {
    ...(isCanvasAddSourceAssetKind(canvasAssetKind) ? { canvasAssetKind } : {}),
    ...(mediaType === 'image' || mediaType === 'video' || mediaType === 'audio'
      ? { mediaType }
      : {}),
    ...(typeof runtimeAssetPath === 'string' ? { runtimeAssetPath } : {}),
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof title === 'string' ? { title } : {}),
    ...(typeof textFormat === 'string' ? { textFormat } : {}),
    ...(typeof textContent === 'string' ? { textContent } : {}),
  };
}

export function applyCanvasAddSourceResult(input: {
  readonly result: ProjectSourceAddResult;
  readonly sourceNameHint: string;
  readonly mediaTypeHint?: 'image' | 'video' | 'audio';
  readonly dropPosition: { x: number; y: number };
  readonly addMediaAt: UseDragDropOptions['addMediaAt'];
  readonly onDropAssets?: (
    assets: CanvasDroppedAsset[],
    position?: { x: number; y: number },
  ) => void;
  readonly onError?: (message: string) => void;
}): void {
  const metadata = readCanvasAddSourceMetadata(input.result);
  const mediaType = metadata.mediaType ?? input.mediaTypeHint;
  if (input.result.ok && input.result.durablePath) {
    if (!input.result.contentLocator) {
      input.onError?.('Canvas source Host result omitted its canonical ContentLocator.');
      return;
    }
    const asset = createCanvasDroppedAssetFromAddSourceResult({
      durablePath: input.result.durablePath,
      contentLocator: input.result.contentLocator,
      metadata,
      sourceNameHint: input.sourceNameHint,
      mediaTypeHint: mediaType,
    });
    if (asset) {
      if (input.onDropAssets) {
        input.onDropAssets([asset], input.dropPosition);
        return;
      }
      if (asset.kind === 'media') {
        input.addMediaAt(input.dropPosition, asset.mediaType, asset.path, asset.name, {
          contentLocator: asset.contentLocator,
          ...(asset.runtimeAssetPath ? { runtimeAssetPath: asset.runtimeAssetPath } : {}),
        });
        return;
      }
    }
    input.onError?.(`Unsupported Canvas source: ${basenameFromSource(input.sourceNameHint)}`);
    return;
  }

  input.onError?.(
    input.result.diagnostics[0]?.message ??
      `Failed to add ${basenameFromSource(input.sourceNameHint)}`,
  );
}

function createCanvasDroppedAssetFromAddSourceResult(input: {
  readonly durablePath: string;
  readonly contentLocator: Extract<ContentLocator, { readonly kind: 'workspace-file' }>;
  readonly metadata: ReturnType<typeof readCanvasAddSourceMetadata>;
  readonly sourceNameHint: string;
  readonly mediaTypeHint?: 'image' | 'video' | 'audio';
}): CanvasDroppedAsset | undefined {
  const name = input.metadata.name ?? basenameFromSource(input.sourceNameHint);
  const title = input.metadata.title ?? (stripExtension(name) || name);
  const kind =
    input.metadata.canvasAssetKind ??
    (input.metadata.mediaType || input.mediaTypeHint ? 'media' : undefined);
  if (kind === 'media') {
    const mediaType = input.metadata.mediaType ?? input.mediaTypeHint;
    if (!mediaType) return undefined;
    return {
      kind: 'media',
      path: input.durablePath,
      name,
      mediaType,
      contentLocator: input.contentLocator,
      ...(input.metadata.runtimeAssetPath
        ? { runtimeAssetPath: input.metadata.runtimeAssetPath }
        : {}),
    };
  }
  if (kind === 'text') {
    const format = input.metadata.textFormat;
    const content = input.metadata.textContent;
    if ((format !== 'plain' && format !== 'markdown') || typeof content !== 'string') {
      return undefined;
    }
    return { kind: 'text', path: input.durablePath, name, title, format, content };
  }
  if (kind === 'file') {
    return {
      kind: 'file',
      path: input.durablePath,
      name,
      title,
      contentLocator: input.contentLocator,
    };
  }
  if (kind === 'canvas') {
    return { kind: 'canvas', path: input.durablePath, name, title };
  }
  return undefined;
}

function createCanvasAddSourceMetadata(input: {
  readonly fileName: string;
  readonly assetKind: ReturnType<typeof inferCanvasDroppedAssetKind> | undefined | null;
  readonly mediaType?: 'image' | 'video' | 'audio';
  readonly dropPosition: { x: number; y: number };
}): Record<string, unknown> {
  const assetKind = input.assetKind ?? (input.mediaType ? 'media' : undefined);
  const baseName = stripExtension(input.fileName);
  return {
    canvasAdd: true,
    ...(assetKind ? { canvasAssetKind: assetKind } : {}),
    ...(input.mediaType ? { mediaType: input.mediaType } : {}),
    dropX: input.dropPosition.x,
    dropY: input.dropPosition.y,
    name: input.fileName,
    title: baseName || input.fileName,
    ...(assetKind === 'text'
      ? { textFormat: inferCanvasTextFileFormat(input.fileName) ?? undefined }
      : {}),
  };
}

function basenameFromSource(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? value;
  const decoded = decodeURIComponentSafe(withoutQuery);
  const parts = decoded.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || value;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeCanvasMediaType(value: unknown): 'image' | 'video' | 'audio' | undefined {
  return value === 'image' || value === 'video' || value === 'audio' ? value : undefined;
}

function readCanvasAssetKindForNodeType(
  nodeType: CanvasNodeType | undefined,
): ReturnType<typeof inferCanvasDroppedAssetKind> | undefined {
  switch (nodeType) {
    case 'media':
      return 'media';
    case 'file':
      return 'file';
    case 'canvas-embed':
      return 'canvas';
    default:
      return undefined;
  }
}

function readCanvasSourceRoleForNodeType(
  nodeType: CanvasNodeType | undefined,
  mediaTypeHint?: 'image' | 'video' | 'audio',
): NonNullable<ProjectSourceAddClientInput['target']>['role'] {
  switch (nodeType) {
    case 'file':
      return 'document';
    case 'canvas-embed':
      return 'project';
    case 'media':
      return mediaTypeHint === 'image' ? 'image' : mediaTypeHint === 'audio' ? 'audio' : 'media';
    default:
      return 'other';
  }
}

function isCanvasAddSourceAssetKind(value: unknown): value is 'media' | 'text' | 'file' | 'canvas' {
  return value === 'media' || value === 'text' || value === 'file' || value === 'canvas';
}

export function createCanvasProjectSourceAddClient(
  hostPort: CanvasHostMessagePort,
): ProjectSourceAddClient {
  return createProjectSourceAddClient({
    postMessage: (message) => {
      hostPort.postMessage(message);
    },
    addMessageListener: (listener) => {
      const handleMessage = (event: MessageEvent) => listener(event.data);
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    },
  });
}

export function hasCanvasExternalDropPayload(dataTransfer: Pick<DataTransfer, 'types'>): boolean {
  const types = Array.from(dataTransfer.types);
  return (
    types.includes('Files') ||
    types.includes(CONTENT_LOCATOR_DRAG_MIME) ||
    types.includes('text/uri-list') ||
    types.includes('application/json') ||
    types.includes('text/plain')
  );
}

function isContentLocatorDragPayload(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['type'] === 'content-locator'
  );
}
