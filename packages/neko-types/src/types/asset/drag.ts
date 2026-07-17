/**
 * Asset Drag & Drop Protocol Types
 *
 * 统一的跨扩展拖拽数据协议。
 * 用于 AssetLibrary → Timeline / Canvas 等场景。
 */

import type { AssetFile, EntityCategory } from './entity';

// =============================================================================
// MIME Types
// =============================================================================

/** 跨扩展资产拖拽的 MIME 类型 */
export const ASSET_DRAG_MIME = 'application/json';

/** 资产库内部拖拽的 MIME 类型（move/merge） */
export const ASSET_INTERNAL_DRAG_MIME = 'application/x-asset-internal';

// =============================================================================
// Drag Data — 对外拖拽（AssetLibrary → Timeline / Canvas）
// =============================================================================

/** 单个拖拽项 */
export interface AssetDragItem {
  entityId: string;
  variantId: string;
  entityName: string;
  variantName: string;
  category: EntityCategory;
  /** 变体关联的文件列表（含 path、mediaType 等） */
  files: AssetFile[];
}

/** 单资产拖拽数据 */
export interface SingleAssetDragData {
  type: 'asset';
  entityId: string;
  variantId: string;
  entityName: string;
  variantName: string;
  category: EntityCategory;
  files: AssetFile[];
}

/** 多资产拖拽数据 */
export interface MultiAssetDragData {
  type: 'assets';
  items: AssetDragItem[];
}

/** 媒体文件拖拽项（MediaLibrary 专用，未注册到 AssetLibrary） */
export interface MediaFileDragItem {
  path: string;
  name: string;
  mediaType: 'video' | 'audio' | 'image';
}

/** 媒体文件拖拽数据（MediaLibrary → Timeline / Canvas） */
export interface MediaFileDragData {
  type: 'media-file';
  files: MediaFileDragItem[];
}

/** 对外拖拽数据联合类型 */
export type AssetDragData = SingleAssetDragData | MultiAssetDragData | MediaFileDragData;

// =============================================================================
// Drag Data — 内部拖拽（AssetLibrary 内 move/merge）
// =============================================================================

/** 内部选择项 */
export interface AssetInternalSelectionItem {
  type: 'entity' | 'variant';
  entityId: string;
  variantId?: string;
}

/** 内部拖拽数据 */
export interface AssetInternalDragData {
  type: 'asset-internal';
  sourceItems: AssetInternalSelectionItem[];
}

// =============================================================================
// Helpers
// =============================================================================

/** 判断是否为单资产拖拽 */
export function isSingleAssetDrag(data: AssetDragData): data is SingleAssetDragData {
  return data.type === 'asset';
}

/** 判断是否为多资产拖拽 */
export function isMultiAssetDrag(data: AssetDragData): data is MultiAssetDragData {
  return data.type === 'assets';
}

/** 判断是否为媒体文件拖拽 */
export function isMediaFileDrag(data: AssetDragData): data is MediaFileDragData {
  return data.type === 'media-file';
}

/** 将拖拽数据统一为 AssetDragItem 数组 */
export function getDragItems(data: AssetDragData): AssetDragItem[] {
  if (isSingleAssetDrag(data)) {
    return [
      {
        entityId: data.entityId,
        variantId: data.variantId,
        entityName: data.entityName,
        variantName: data.variantName,
        category: data.category,
        files: data.files,
      },
    ];
  }
  if (isMediaFileDrag(data)) {
    // Convert MediaFileDragData to AssetDragItem format
    // entityId/variantId are empty strings (not registered in AssetLibrary)
    return data.files.map((file) => ({
      entityId: '',
      variantId: '',
      entityName: file.name,
      variantName: 'default',
      category: file.mediaType as EntityCategory,
      files: [
        {
          id: '',
          variantId: '',
          name: file.name,
          path: file.path,
          mediaType: file.mediaType,
          status: 'online' as const,
          metadata: {
            fileSize: 0,
            mimeType: getMimeTypeForMedia(file.mediaType),
          },
          createdAt: Date.now(),
        },
      ],
    }));
  }
  return data.items;
}

/** Helper: Get MIME type for media type */
function getMimeTypeForMedia(mediaType: 'video' | 'audio' | 'image'): string {
  switch (mediaType) {
    case 'video':
      return 'video/mp4';
    case 'audio':
      return 'audio/mpeg';
    case 'image':
      return 'image/jpeg';
  }
}
