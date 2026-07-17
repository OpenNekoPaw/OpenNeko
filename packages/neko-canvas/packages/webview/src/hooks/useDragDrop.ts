// TODO: Duplicated hook — neko-audio has a similar useDragDrop (69 lines) with
// incompatible API (audio-specific: postMessage only, no position tracking).
// Both use @neko/ui/hooks useFileDrop internally but wrap it differently.
// Consider extracting a shared base hook to @neko/ui/hooks/useDragDrop that
// provides common DnD lifecycle (isDragOver, dropProps) with a pluggable onDrop strategy.

/**
 * useDragDrop - Drag & drop handling for canvas
 *
 * Handles drag-and-drop of files from the VSCode explorer, native
 * file system, and asset library into the canvas.
 */

import { useCallback, useRef, useState } from 'react';
import {
  createProjectSourceAddClient,
  inferCanvasDocumentType,
  inferCanvasDroppedAssetKind,
  inferCanvasMediaType,
  inferCanvasModelType,
  inferCanvasTextFileFormat,
  inferNkProjectType,
  type ProjectSourceAddClient,
  type ProjectSourceAddClientInput,
  type ProjectSourceAddResult,
  type CanvasDroppedAsset,
  type CanvasNodeType,
} from '@neko/shared';
import { useFileDrop } from '@neko/ui/hooks';
import type { FileDropResult } from '@neko/ui/hooks';
import { detectMediaType } from '../utils/mediaType';
import { hasNodeLibraryDragPayload, readNodeLibraryDragPayload } from '../utils/nodeLibraryDrag';
import type { VSCodeAPI } from './useVSCodeMessages';

// =============================================================================
// Types
// =============================================================================

export type CanvasProjectSourceAddClient = ProjectSourceAddClient;

export interface UseDragDropOptions {
  vscode: VSCodeAPI;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  addMediaAt: (
    pos: { x: number; y: number },
    mediaType: 'image' | 'video' | 'audio',
    uri?: string,
    name?: string,
    options?: { runtimeAssetPath?: string },
  ) => void;
  onDropNodeType?: (type: CanvasNodeType, position: { x: number; y: number }) => void;
  onDropAssets?: (assets: CanvasDroppedAsset[], position?: { x: number; y: number }) => void;
  addSourceClient?: ProjectSourceAddClient;
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
  const { vscode, screenToCanvas, addMediaAt, onDropNodeType, onError } = options;

  const dropPositionRef = useRef<{ x: number; y: number } | null>(null);
  const [isNodeLibraryDragOver, setIsNodeLibraryDragOver] = useState(false);

  const handleFileDrop = useCallback(
    async (result: FileDropResult, event: React.DragEvent) => {
      // Save drop position for when extension responds
      dropPositionRef.current = screenToCanvas(event.clientX, event.clientY);

      if (result.type === 'asset-json' && result.assetData) {
        // Asset Library protocol
        const data = result.assetData as Record<string, unknown>;
        if (data.type === 'asset' || data.type === 'assets' || data.type === 'media-file') {
          const items =
            data.type === 'assets'
              ? (data.items as unknown[])
              : data.type === 'media-file'
                ? (data.files as Array<{ path: string }>).map((f) => ({
                    files: [{ path: f.path }],
                  }))
                : [data];
          const addSourceClient =
            options.addSourceClient ?? createCanvasProjectSourceAddClient(vscode);
          const pos = dropPositionRef.current ?? { x: 0, y: 0 };
          for (let i = 0; i < (items as unknown[]).length; i++) {
            const item = (items as Array<Record<string, unknown>>)[i];
            const files = item?.['files'] as Array<Record<string, string>> | undefined;
            const file = files?.[0];
            if (file) {
              const filePath = file['path'];
              if (!filePath) continue;
              const dropPos = { x: pos.x + i * 30, y: pos.y + i * 30 };
              const addResult = await addSourceClient.addSource(
                createCanvasAssetAddSourceInput({
                  sourcePath: filePath,
                  name: file['name'] ?? filePath,
                  mediaType: normalizeCanvasMediaType(file['mediaType']),
                  dropPosition: dropPos,
                }),
              );
              applyCanvasAddSourceResult({
                result: addResult,
                sourceNameHint: file['name'] ?? filePath,
                mediaTypeHint: normalizeCanvasMediaType(file['mediaType']),
                dropPosition: dropPos,
                addMediaAt,
                onDropAssets: options.onDropAssets,
                onError,
              });
            }
          }
        }
      } else if (result.type === 'uri-list' && result.uris) {
        const addSourceClient =
          options.addSourceClient ?? createCanvasProjectSourceAddClient(vscode);
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
          options.addSourceClient ?? createCanvasProjectSourceAddClient(vscode);
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
    [vscode, screenToCanvas, addMediaAt, options.addSourceClient, options.onDropAssets, onError],
  );

  const { isDragOver, dropProps } = useFileDrop(handleFileDrop);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (hasNodeLibraryDragPayload(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setIsNodeLibraryDragOver(true);
        return;
      }
      dropProps.onDragEnter(e);
    },
    [dropProps],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (hasNodeLibraryDragPayload(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setIsNodeLibraryDragOver(true);
        return;
      }
      dropProps.onDragOver(e);
    },
    [dropProps],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (isNodeLibraryDragLeavingCanvas(e, options.canvasContainerRef.current)) {
        setIsNodeLibraryDragOver(false);
      }
      dropProps.onDragLeave(e);
    },
    [dropProps, options.canvasContainerRef],
  );

  // Wrap the drop handler to also check for cross-extension DnD payload (ADR-5 P1).
  // When a drag originates from another VSCode webview iframe, the dataTransfer is
  // empty — so we always notify the extension host to check for a pending DnD payload.
  const handleDropWithCrossExtension = useCallback(
    (e: React.DragEvent) => {
      const droppedNodeType = readNodeLibraryDragPayload(e.dataTransfer);
      if (droppedNodeType) {
        e.preventDefault();
        e.stopPropagation();
        setIsNodeLibraryDragOver(false);
        const position = screenToCanvas(e.clientX, e.clientY);
        dropPositionRef.current = position;
        onDropNodeType?.(droppedNodeType, position);
        dropPositionRef.current = null;
        return;
      }

      // Let useFileDrop handle file/URI/asset drops first
      setIsNodeLibraryDragOver(false);
      const hasExternalDropPayload = hasCanvasExternalDropPayload(e.dataTransfer);
      dropProps.onDrop(e);

      // Also ask the extension host if there is a cross-extension DnD payload
      if (vscode && !hasExternalDropPayload) {
        vscode.postMessage({ type: 'dnd:drop' });
      }
    },
    [dropProps, onDropNodeType, screenToCanvas, vscode],
  );

  return {
    isDragOver: isDragOver || isNodeLibraryDragOver,
    dropPositionRef,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop: handleDropWithCrossExtension,
  };
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
        metadata.canvasAssetKind === 'project'
          ? 'project'
          : metadata.canvasAssetKind === 'document'
            ? 'document'
            : metadata.canvasAssetKind === 'model'
              ? 'model'
              : mediaType === 'audio'
                ? 'audio'
                : mediaType === 'image'
                  ? 'image'
                  : 'media',
    },
    destination: {
      kind: 'project',
      directory: mediaType ? 'media' : 'assets',
      copyMode: 'link',
    },
    ingestMode: 'link',
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
    destination: {
      kind: 'project',
      directory: 'media',
      copyMode: 'copy',
    },
    ingestMode: 'create-asset',
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
): ProjectSourceAddClientInput {
  const sourceNameHint = getCanvasFilePickerDefaultName(nodeType);
  const assetKind = readCanvasAssetKindForNodeType(nodeType);
  const metadata = createCanvasAddSourceMetadata({
    fileName: sourceNameHint,
    assetKind,
    dropPosition,
  });

  return {
    kind: 'file-picker',
    formatId: 'nkc',
    browserFile: { name: sourceNameHint },
    target: {
      role: readCanvasSourceRoleForNodeType(nodeType),
    },
    destination: {
      kind: 'project',
      directory: assetKind === 'media' ? 'media' : 'assets',
      copyMode: 'link',
    },
    ingestMode: 'link',
    metadata,
  };
}

export function getCanvasFilePickerDefaultName(nodeType: CanvasNodeType | undefined): string {
  switch (nodeType) {
    case 'media':
      return 'media';
    case 'text':
      return 'text.txt';
    case 'script':
      return 'script.fountain';
    case 'document':
      return 'document.pdf';
    case 'model':
      return 'model.safetensors';
    case 'canvas-embed':
      return 'canvas.nkc';
    case 'project':
      return 'project.nkv';
    default:
      return 'source';
  }
}

function readCanvasAddSourceMetadata(result: ProjectSourceAddResult): {
  readonly canvasAssetKind?:
    'media' | 'text' | 'script' | 'document' | 'model' | 'canvas' | 'project';
  readonly mediaType?: 'image' | 'video' | 'audio';
  readonly runtimeAssetPath?: string;
  readonly name?: string;
  readonly title?: string;
  readonly docType?: string;
  readonly modelType?: string;
  readonly projectType?: string;
  readonly textFormat?: string;
  readonly textContent?: string;
} {
  const metadata = result.ingest?.metadata;
  const canvasAssetKind = metadata?.['canvasAssetKind'];
  const mediaType = metadata?.['mediaType'];
  const runtimeAssetPath = metadata?.['runtimeAssetPath'];
  const name = metadata?.['name'];
  const title = metadata?.['title'];
  const docType = metadata?.['docType'];
  const modelType = metadata?.['modelType'];
  const projectType = metadata?.['projectType'];
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
    ...(typeof docType === 'string' ? { docType } : {}),
    ...(typeof modelType === 'string' ? { modelType } : {}),
    ...(typeof projectType === 'string' ? { projectType } : {}),
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
    const asset = createCanvasDroppedAssetFromAddSourceResult({
      durablePath: input.result.durablePath,
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
  if (kind === 'script') {
    return { kind: 'script', path: input.durablePath, name, title };
  }
  if (kind === 'document') {
    const docType = input.metadata.docType;
    if (
      docType !== 'pdf' &&
      docType !== 'docx' &&
      docType !== 'epub' &&
      docType !== 'cbz' &&
      docType !== 'markdown' &&
      docType !== 'text'
    ) {
      return undefined;
    }
    return { kind: 'document', path: input.durablePath, name, title, docType };
  }
  if (kind === 'model') {
    const modelType = input.metadata.modelType;
    if (
      modelType !== 'checkpoint' &&
      modelType !== 'lora' &&
      modelType !== 'vae' &&
      modelType !== 'controlnet'
    ) {
      return undefined;
    }
    return {
      kind: 'model',
      path: input.durablePath,
      name,
      modelName: title,
      modelType,
      role: 'reference',
    };
  }
  if (kind === 'canvas') {
    return { kind: 'canvas', path: input.durablePath, name, title };
  }
  if (kind === 'project') {
    const projectType = input.metadata.projectType;
    if (
      projectType !== 'nkv' &&
      projectType !== 'nka' &&
      projectType !== 'nkm' &&
      projectType !== 'nkp'
    ) {
      return undefined;
    }
    return { kind: 'project', path: input.durablePath, name, title, projectType };
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
    ...(assetKind === 'document'
      ? { docType: inferCanvasDocumentType(input.fileName) ?? undefined }
      : {}),
    ...(assetKind === 'text'
      ? { textFormat: inferCanvasTextFileFormat(input.fileName) ?? undefined }
      : {}),
    ...(assetKind === 'model'
      ? { modelType: inferCanvasModelType(input.fileName) ?? undefined }
      : {}),
    ...(assetKind === 'project'
      ? { projectType: inferNkProjectType(input.fileName) ?? undefined }
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
    case 'text':
      return 'text';
    case 'script':
      return 'text';
    case 'document':
      return 'document';
    case 'model':
      return 'model';
    case 'canvas-embed':
      return 'canvas';
    case 'project':
      return 'project';
    default:
      return undefined;
  }
}

function readCanvasSourceRoleForNodeType(
  nodeType: CanvasNodeType | undefined,
): NonNullable<ProjectSourceAddClientInput['target']>['role'] {
  switch (nodeType) {
    case 'script':
      return 'document';
    case 'text':
      return 'document';
    case 'document':
      return 'document';
    case 'model':
      return 'model';
    case 'project':
      return 'project';
    case 'canvas-embed':
      return 'project';
    case 'media':
      return 'media';
    default:
      return 'other';
  }
}

function isCanvasAddSourceAssetKind(
  value: unknown,
): value is 'media' | 'text' | 'script' | 'document' | 'model' | 'canvas' | 'project' {
  return (
    value === 'media' ||
    value === 'text' ||
    value === 'script' ||
    value === 'document' ||
    value === 'model' ||
    value === 'canvas' ||
    value === 'project'
  );
}

export function createCanvasProjectSourceAddClient(vscode: VSCodeAPI): ProjectSourceAddClient {
  if (!vscode) {
    return {
      async addSource(input) {
        return {
          requestId: input.requestId ?? `canvas-add-source-unavailable-${Date.now()}`,
          ok: false,
          diagnostics: [
            {
              code: 'missing-source',
              severity: 'error',
              message: 'Canvas media add requires Extension Host source handling.',
              recoverability: 'create-asset',
            },
          ],
        };
      },
    };
  }

  return createProjectSourceAddClient({
    postMessage: (message) => {
      vscode.postMessage(message);
    },
    addMessageListener: (listener) => {
      const handleMessage = (event: MessageEvent) => listener(event.data);
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    },
  });
}

export function isNodeLibraryDragLeavingCanvas(
  event: Pick<React.DragEvent, 'relatedTarget'>,
  canvasElement: HTMLDivElement | null,
): boolean {
  const nextTarget = event.relatedTarget;
  return nextTarget === null || !isDomNode(nextTarget) || !canvasElement?.contains(nextTarget);
}

export function hasCanvasExternalDropPayload(dataTransfer: Pick<DataTransfer, 'types'>): boolean {
  const types = Array.from(dataTransfer.types);
  return (
    types.includes('Files') ||
    types.includes('text/uri-list') ||
    types.includes('application/json') ||
    types.includes('text/plain')
  );
}

export function isDomNode(value: EventTarget | null): value is Node {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (typeof Node !== 'undefined') {
    return value instanceof Node;
  }
  return typeof (value as { nodeType?: unknown }).nodeType === 'number';
}
