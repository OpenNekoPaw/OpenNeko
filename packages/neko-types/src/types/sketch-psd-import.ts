// =============================================================================
// Sketch PSD Import Wire Types
//
// Cross-process PSD import contract for Extension Host -> Webview messages.
// Keep this file DOM-free: @neko/shared is L0 and must not depend on browser
// image types such as ImageData, ImageBitmap, Canvas, or OffscreenCanvas.
// =============================================================================

export interface PsdCanvasWire {
  readonly width: number;
  readonly height: number;
  readonly dpi: number;
  readonly backgroundColor: string;
}

export type PsdLayerKindWire = 'group' | 'raster';

export interface PsdEncodedPixelsWire {
  readonly kind: 'encoded';
  readonly dataBase64: string;
  readonly mimeType: 'image/png';
}

export interface PsdLayerNodeWire {
  readonly id?: string;
  readonly name: string;
  readonly kind: PsdLayerKindWire;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: string;
  readonly clippingMask: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly children?: readonly PsdLayerNodeWire[];
  readonly pixels?: PsdEncodedPixelsWire;
}

export interface PsdDocumentTreeWire {
  readonly canvas: PsdCanvasWire;
  readonly layers: readonly PsdLayerNodeWire[];
}

export type PsdImportIssueSeverity = 'warning' | 'error';

export type PsdImportIssueCode =
  | 'unsupported-blend-mode'
  | 'unsupported-color-mode'
  | 'unsupported-layer-kind'
  | 'missing-pixel-data'
  | 'mask-not-imported'
  | 'texture-size-exceeded'
  | 'layer-count-exceeded'
  | 'memory-budget-exceeded'
  | 'group-isolation-mismatch'
  | 'parser-unavailable'
  | 'parse-failed';

export interface PsdImportIssue {
  readonly code: PsdImportIssueCode;
  readonly severity: PsdImportIssueSeverity;
  readonly message: string;
  readonly layerPath?: readonly string[];
}

export interface PsdImportPayloadWire {
  readonly name: string;
  readonly tree: PsdDocumentTreeWire;
  readonly issues: readonly PsdImportIssue[];
}
