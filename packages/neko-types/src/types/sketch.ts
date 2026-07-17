// =============================================================================
// Sketch Document Types — .nks file format
//
// Persisted structure for 2D drawing projects. Raster pixel data is stored
// as base64-encoded strings within NksLayerData.data.
// =============================================================================

import type { SketchBlendMode } from './blendMode';

export type NksDocumentVersion = '1.0' | '1.1' | '1.2';
export const CURRENT_NKS_VERSION: NksDocumentVersion = '1.2';

/** Layer types in a sketch document */
export type LayerType = 'raster' | 'group' | 'vector' | 'text' | 'fill' | 'adjustment';

export type NksLayerSourceRole = 'image' | 'psd' | 'generated-image' | 'reference';

export interface NksLayerSourceRef {
  readonly kind: 'file';
  readonly path: string;
  readonly role: NksLayerSourceRole;
  readonly mimeType?: string;
  readonly originalName?: string;
}

export type NksVectorSegmentType = 'move' | 'line' | 'cubic' | 'quadratic';

export interface NksVectorPathSegment {
  readonly type: NksVectorSegmentType;
  readonly points: readonly (readonly [number, number])[];
}

export type NksVectorFillRule = 'evenodd' | 'nonzero';

export interface NksVectorFillStyle {
  readonly color: readonly [number, number, number, number];
  readonly rule: NksVectorFillRule;
}

export type NksVectorLineCap = 'butt' | 'round' | 'square';
export type NksVectorLineJoin = 'miter' | 'round' | 'bevel';

export interface NksVectorStrokeStyle {
  readonly color: readonly [number, number, number, number];
  readonly width: number;
  readonly cap: NksVectorLineCap;
  readonly join: NksVectorLineJoin;
}

export interface NksVectorPath {
  readonly id: string;
  readonly segments: readonly NksVectorPathSegment[];
  readonly closed: boolean;
  readonly fill: NksVectorFillStyle | null;
  readonly stroke: NksVectorStrokeStyle | null;
}

export type NksVectorNodeRole = 'anchor' | 'control-in' | 'control-out' | 'control';
export type NksVectorHandleMode = 'corner' | 'smooth' | 'mirrored';

export interface NksVectorNodeRef {
  readonly pathId: string;
  readonly segmentIndex: number;
  readonly pointIndex: number;
  readonly role: NksVectorNodeRole;
}

export interface NksVectorHandleModeAssignment {
  readonly anchor: NksVectorNodeRef;
  readonly mode: NksVectorHandleMode;
}

export interface NksVectorLayerData {
  readonly paths: readonly NksVectorPath[];
  readonly selectedPathId?: string | null;
  readonly selectedNodeRefs?: readonly NksVectorNodeRef[];
  readonly handleModes?: readonly NksVectorHandleModeAssignment[];
}

/** Serialized layer data in .nks file */
export interface NksLayerData {
  readonly id: string;
  readonly name: string;
  readonly type: LayerType;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: SketchBlendMode;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly clippingMask: boolean;
  readonly maskLayerId: string | null;
  readonly children: NksLayerData[];
  /** Base64-encoded pixel data for raster layers */
  readonly data?: string;
  /** Stable source used to create or refresh this layer */
  readonly source?: NksLayerSourceRef;
  /** Base64-encoded normal map data for lighting workflows */
  readonly normalData?: string;
  /** Paint only into existing layer alpha */
  readonly alphaLock?: boolean;
  /** Adjustment layer filter id */
  readonly adjustmentFilter?: string;
  /** Adjustment layer filter parameter overrides */
  readonly adjustmentParams?: Record<string, number>;
  /** Editable vector source data for vector layers */
  readonly vectorData?: NksVectorLayerData;
}

/** .nks document format */
export interface NksDocument {
  readonly version: NksDocumentVersion | string;
  readonly canvas: {
    readonly width: number;
    readonly height: number;
    readonly dpi: number;
    readonly backgroundColor: string;
  };
  readonly layers: NksLayerData[];
  readonly brushPresets: BrushPreset[];
  readonly palette: string[];
  readonly viewport: {
    readonly panX: number;
    readonly panY: number;
    readonly zoom: number;
    readonly rotation?: number;
  };
}

/** Brush preset stored in .nks */
export interface BrushPreset {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly opacity: number;
  readonly hardness: number;
  readonly spacing: number;
}
