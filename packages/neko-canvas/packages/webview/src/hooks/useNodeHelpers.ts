/**
 * useNodeHelpers - Node creation helper functions
 *
 * Provides factory functions for adding text, storyboard, and media
 * nodes at specific canvas positions.
 */

import { useCallback } from 'react';
import type {
  CanvasCreateCompositeRequest,
  CanvasCreateCompositeResult,
  CanvasNode,
  ContainerChildPlacement,
  DocumentArchiveResourceRef,
  DocumentCanvasNode,
  DroppedTextCanvasAsset,
  NkProjectType,
  ResourceRef,
  TextCanvasNode,
} from '@neko/shared';
import { GALLERY_PRESET_CONFIGS } from '@neko/shared';
import { t } from '../i18n';
import { buildCanvasNode } from '../utils/nodeFactory';

// =============================================================================
// Types
// =============================================================================

export interface UseNodeHelpersOptions {
  addNode: (node: Omit<CanvasNode, 'id'>) => string;
  createComposite: (request: CanvasCreateCompositeRequest) => CanvasCreateCompositeResult | null;
  updateNode: (id: string, updates: Partial<CanvasNode>) => void;
  nodeCount: number;
  reportAction: (action: string, label: string, detail?: string) => void;
}

export interface UseNodeHelpersReturn {
  addTextAt: (pos: { x: number; y: number }) => void;
  addImportedTextAt: (pos: { x: number; y: number }, asset: DroppedTextCanvasAsset) => void;
  addMediaAt: (
    pos: { x: number; y: number },
    mediaType: 'image' | 'video' | 'audio',
    uri?: string,
    name?: string,
    options?: {
      documentResourceRef?: DocumentArchiveResourceRef;
      resourceRef?: ResourceRef;
      runtimeAssetPath?: string;
    },
  ) => void;
  addShotAt: (pos: { x: number; y: number }) => void;
  addSceneGroupAt: (pos: { x: number; y: number }) => void;
  addGalleryAt: (pos: { x: number; y: number }, preset?: string) => void;
  addTableAt: (pos: { x: number; y: number }) => void;
  addScriptAt: (pos: { x: number; y: number }, scriptPath?: string, scriptTitle?: string) => void;
  addDocumentAt: (
    pos: { x: number; y: number },
    docPath?: string,
    title?: string,
    docType?: DocumentCanvasNode['data']['docType'],
  ) => void;
  addModelAt: (
    pos: { x: number; y: number },
    modelPath?: string,
    modelName?: string,
    modelType?: 'lora' | 'checkpoint' | 'controlnet' | 'vae',
    role?: 'reference' | 'workflow',
  ) => void;
  addCanvasEmbedAt: (pos: { x: number; y: number }, canvasPath?: string, title?: string) => void;
  addProjectAt: (
    pos: { x: number; y: number },
    projectPath: string,
    title: string,
    projectType: NkProjectType,
  ) => void;
}

export function createImportedTextNodeData(asset: DroppedTextCanvasAsset): TextCanvasNode['data'] {
  return {
    content: asset.content,
    format: asset.format,
    title: asset.title || asset.name,
    provenance: {
      importMode: 'snapshot',
      sourcePath: asset.path,
      sourceName: asset.name,
    },
  };
}

// =============================================================================
// Hook
// =============================================================================

export function useNodeHelpers(options: UseNodeHelpersOptions): UseNodeHelpersReturn {
  const { addNode, createComposite, updateNode, nodeCount, reportAction } = options;

  const addTextAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'annotation',
          position: pos,
          zIndex: nodeCount,
          data: { content: t('node.newText') },
          preset: 'annotation.basic',
        }),
      );
      reportAction('addNode', 'Add text note');
    },
    [addNode, nodeCount, reportAction],
  );

  const addImportedTextAt = useCallback(
    (pos: { x: number; y: number }, asset: DroppedTextCanvasAsset) => {
      addNode(
        buildCanvasNode({
          type: 'text',
          position: pos,
          zIndex: nodeCount,
          data: createImportedTextNodeData(asset),
          preset: 'text.basic',
        }),
      );
      reportAction('addNode', 'Import text snapshot', asset.name);
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
        documentResourceRef?: DocumentArchiveResourceRef;
        resourceRef?: ResourceRef;
        runtimeAssetPath?: string;
      },
    ) => {
      const linkedDocumentResource = options?.documentResourceRef;
      const linkedResource = options?.resourceRef;
      const hasLinkedResource = Boolean(linkedDocumentResource || linkedResource);
      const runtimePath = options?.runtimeAssetPath ?? (hasLinkedResource ? uri : undefined);
      addNode(
        buildCanvasNode({
          type: 'media',
          position: pos,
          zIndex: nodeCount,
          data: {
            assetPath: hasLinkedResource ? '' : uri || '',
            ...(linkedDocumentResource ? { documentResourceRef: linkedDocumentResource } : {}),
            ...(linkedResource ? { resourceRef: linkedResource } : {}),
            ...(runtimePath ? { runtimeAssetPath: runtimePath } : {}),
            mediaType,
            thumbnailPath: undefined,
            duration: undefined,
          },
          preset: 'media.basic',
        }),
      );
      reportAction('addNode', `Add ${mediaType}`, name);
    },
    [addNode, nodeCount, reportAction],
  );

  const addShotAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'shot',
          position: pos,
          zIndex: nodeCount,
          data: {
            shotNumber: nodeCount + 1,
            duration: 3,
            visualDescription: '',
            characters: [],
            shotScale: 'MS',
            characterAction: '',
            emotion: [],
            sceneTags: [],
            generationStatus: 'idle',
            generationHistory: [],
          },
          preset: 'shot.basic',
        }),
      );
      reportAction('addNode', 'Add shot');
    },
    [addNode, nodeCount, reportAction],
  );

  const addSceneGroupAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'scene',
          position: pos,
          zIndex: nodeCount,
          data: {
            sceneTitle: t('node.newScene'),
            sceneNumber: nodeCount + 1,
          },
          preset: 'scene.basic',
        }),
      );
      reportAction('addNode', 'Add scene group');
    },
    [addNode, nodeCount, reportAction],
  );

  const addGalleryAt = useCallback(
    (pos: { x: number; y: number }, preset?: string) => {
      const galleryPreset = (
        preset && preset in GALLERY_PRESET_CONFIGS ? preset : 'character-3view'
      ) as keyof typeof GALLERY_PRESET_CONFIGS;
      const config = GALLERY_PRESET_CONFIGS[galleryPreset];

      const children = config.labels.map((label) => ({
        type: 'media' as const,
        data: { assetPath: '', mediaType: 'image' },
        _galleryMetadata: { label, generationStatus: 'idle' },
      }));

      const result = createComposite({
        containerPreset: 'gallery.basic',
        containerType: 'gallery',
        position: pos,
        data: {
          preset: galleryPreset,
          rows: config.rows,
          cols: config.cols,
        },
        children: children.map(({ type, data }) => ({ type, data })),
        autoLayout: true,
      });

      if (result) {
        const placements: Record<string, ContainerChildPlacement> = {};
        result.childIds.forEach((childId, i) => {
          const meta = children[i];
          if (meta) {
            placements[childId] = {
              childId,
              metadata: meta._galleryMetadata,
            };
          }
        });
        updateNode(result.containerId, {
          container: {
            policy: 'gallery',
            childIds: result.childIds,
            layout: { mode: 'gallery' as const },
            acceptedChildren: { nodeTypes: ['media'] },
            deleteBehavior: 'delete-subtree' as const,
            childPlacements: placements,
          },
        });
      }

      reportAction('addNode', 'Add gallery');
    },
    [createComposite, updateNode, reportAction],
  );

  const addTableAt = useCallback(
    (pos: { x: number; y: number }) => {
      addNode(
        buildCanvasNode({
          type: 'table',
          position: pos,
          zIndex: nodeCount,
          data: {
            label: t('node.newTable'),
            columnCount: 3,
            rowCount: 3,
            showHeader: true,
          },
          preset: 'table.basic',
        }),
      );
      reportAction('addNode', 'Add table');
    },
    [addNode, nodeCount, reportAction],
  );

  const addScriptAt = useCallback(
    (pos: { x: number; y: number }, scriptPath = '', scriptTitle = 'Script') => {
      const w = 280,
        h = 220;
      addNode({
        type: 'script',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          scriptPath,
          scriptTitle,
          scenes: [],
        },
      });
      reportAction('addNode', 'Add script reference', scriptTitle || undefined);
    },
    [addNode, nodeCount, reportAction],
  );

  const addDocumentAt = useCallback(
    (
      pos: { x: number; y: number },
      docPath = '',
      title = 'Document',
      docType: DocumentCanvasNode['data']['docType'] = 'pdf',
    ) => {
      const textLike = docType === 'markdown' || docType === 'text';
      const w = textLike ? 420 : 220,
        h = textLike ? 360 : 280;
      addNode({
        type: 'document',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          docPath,
          docType,
          title,
        },
      });
      reportAction('addNode', 'Add document reference', title || undefined);
    },
    [addNode, nodeCount, reportAction],
  );

  const addModelAt = useCallback(
    (
      pos: { x: number; y: number },
      modelPath = '',
      modelName = 'Model',
      modelType: 'lora' | 'checkpoint' | 'controlnet' | 'vae' = 'lora',
      role: 'reference' | 'workflow' = 'reference',
    ) => {
      const w = 240,
        h = 160;
      addNode({
        type: 'model',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          modelPath,
          modelName,
          modelType,
          role,
        },
      });
      reportAction('addNode', 'Add model reference', modelName || undefined);
    },
    [addNode, nodeCount, reportAction],
  );

  const addCanvasEmbedAt = useCallback(
    (pos: { x: number; y: number }, canvasPath = '', title = 'Canvas') => {
      const w = 220,
        h = 180;
      addNode({
        type: 'canvas-embed',
        position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        size: { width: w, height: h },
        zIndex: nodeCount,
        data: {
          canvasPath,
          canvasTitle: title,
        },
      });
      reportAction('addNode', 'Add canvas embed', title || undefined);
    },
    [addNode, nodeCount, reportAction],
  );

  const addProjectAt = useCallback(
    (
      pos: { x: number; y: number },
      projectPath: string,
      title = t('node.project'),
      projectType: NkProjectType,
    ) => {
      const w = 260,
        h = 180;
      addNode(
        buildCanvasNode({
          type: 'project',
          position: { x: pos.x - w / 2, y: pos.y - h / 2 },
          zIndex: nodeCount,
          data: {
            projectPath,
            projectTitle: title,
            projectType,
          },
          preset: 'project.basic',
        }),
      );
      reportAction('addNode', 'Add project reference', title || undefined);
    },
    [addNode, nodeCount, reportAction],
  );

  return {
    addTextAt,
    addImportedTextAt,
    addMediaAt,
    addShotAt,
    addSceneGroupAt,
    addGalleryAt,
    addTableAt,
    addScriptAt,
    addDocumentAt,
    addModelAt,
    addCanvasEmbedAt,
    addProjectAt,
  };
}
