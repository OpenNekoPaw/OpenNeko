import { useCallback } from 'react';
import type { DroppedTextCanvasAsset } from '@neko/canvas-domain';
import type { ContentLocator } from '@neko/content-domain';
import type { CanvasNode, MarkdownCanvasNode } from '@neko/canvas-domain';
import { buildCanvasNode } from '../utils/nodeFactory';

export interface UseNodeHelpersOptions {
  addNode: (node: Omit<CanvasNode, 'id'>) => string;
  nodeCount: number;
  reportAction: (action: string, label: string, detail?: string) => void;
}

export interface UseNodeHelpersReturn {
  addMarkdownAt: (pos: { x: number; y: number }) => void;
  addTableAt: (pos: { x: number; y: number }) => void;
  addImportedMarkdownAt: (pos: { x: number; y: number }, asset: DroppedTextCanvasAsset) => void;
  addMediaAt: (
    pos: { x: number; y: number },
    mediaType: 'image' | 'video' | 'audio',
    uri?: string,
    name?: string,
    options?: {
      contentLocator: ContentLocator;
      runtimeAssetPath?: string;
      intrinsicDimensions?: { readonly width: number; readonly height: number };
    },
  ) => void;
  addGroupAt: (pos: { x: number; y: number }) => void;
  addFileAt: (
    pos: { x: number; y: number },
    path: string,
    title: string,
    contentLocator: ContentLocator,
    mediaType?: string,
  ) => void;
  addCanvasEmbedAt: (pos: { x: number; y: number }, canvasPath: string, title: string) => void;
}

export function createTableMarkdownNodeData(): MarkdownCanvasNode['data'] {
  return {
    title: 'Table',
    content: '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |',
  };
}

export function createImportedMarkdownNodeData(
  asset: DroppedTextCanvasAsset,
): MarkdownCanvasNode['data'] {
  return {
    content: asset.content,
    title: asset.title || asset.name,
    provenance: {
      importMode: 'snapshot',
      sourcePath: asset.path,
      sourceName: asset.name,
    },
  };
}

export function useNodeHelpers(options: UseNodeHelpersOptions): UseNodeHelpersReturn {
  const { addNode, nodeCount, reportAction } = options;

  const addMarkdownAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'markdown',
          position: pos,
          zIndex: nodeCount,
          data: { content: '' },
        }),
      );
      reportAction('node.create', 'markdown');
    },
    [addNode, nodeCount, reportAction],
  );

  const addImportedMarkdownAt = useCallback(
    (pos: { x: number; y: number }, asset: DroppedTextCanvasAsset) => {
      addNode(
        buildCanvasNode({
          type: 'markdown',
          position: pos,
          zIndex: nodeCount,
          data: createImportedMarkdownNodeData(asset),
        }),
      );
      reportAction('node.create', 'markdown', asset.name);
    },
    [addNode, nodeCount, reportAction],
  );

  const addTableAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'markdown',
          position: pos,
          zIndex: nodeCount,
          data: createTableMarkdownNodeData(),
        }),
      );
      reportAction('node.create', 'table');
    },
    [addNode, nodeCount, reportAction],
  );

  const addMediaAt = useCallback(
    (
      pos: { x: number; y: number },
      mediaType: 'image' | 'video' | 'audio',
      uri?: string,
      name?: string,
      options?: {
        contentLocator?: ContentLocator;
        runtimeAssetPath?: string;
        intrinsicDimensions?: { readonly width: number; readonly height: number };
      },
    ) => {
      const contentLocator = options?.contentLocator;
      if (!contentLocator) {
        throw new Error('Canvas Media creation requires a canonical ContentLocator.');
      }
      const runtimePath = options?.runtimeAssetPath ?? uri;
      addNode(
        buildCanvasNode({
          type: 'media',
          position: pos,
          zIndex: nodeCount,
          data: {
            assetPath: '',
            contentLocator,
            ...(runtimePath ? { runtimeAssetPath: runtimePath } : {}),
            ...(name ? { title: name } : {}),
            mediaType,
            ...(options?.intrinsicDimensions
              ? { intrinsicDimensions: options.intrinsicDimensions }
              : {}),
          },
        }),
      );
      reportAction('node.create', mediaType, name);
    },
    [addNode, nodeCount, reportAction],
  );

  const addGroupAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'group',
          position: pos,
          zIndex: nodeCount,
          data: {},
        }),
      );
      reportAction('node.create', 'group');
    },
    [addNode, nodeCount, reportAction],
  );

  const addFileAt = useCallback(
    (
      pos: { x: number; y: number },
      path: string,
      title: string,
      contentLocator: ContentLocator,
      mediaType?: string,
    ) => {
      addNode(
        buildCanvasNode({
          type: 'file',
          position: pos,
          zIndex: nodeCount,
          data: { path, title, contentLocator, ...(mediaType ? { mediaType } : {}) },
        }),
      );
      reportAction('node.create', 'file', title);
    },
    [addNode, nodeCount, reportAction],
  );

  const addCanvasEmbedAt = useCallback(
    (pos: { x: number; y: number }, canvasPath: string, title: string) => {
      addNode(
        buildCanvasNode({
          type: 'canvas-embed',
          position: pos,
          zIndex: nodeCount,
          data: { canvasPath, canvasTitle: title },
        }),
      );
      reportAction('node.create', 'canvas-embed', title);
    },
    [addNode, nodeCount, reportAction],
  );

  return {
    addMarkdownAt,
    addTableAt,
    addImportedMarkdownAt,
    addMediaAt,
    addGroupAt,
    addFileAt,
    addCanvasEmbedAt,
  };
}
