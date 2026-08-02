import type { ContentLocator } from '@neko/content';

/** Stable media evidence reference shared by Agent projection and generation records. */
export interface PerceptualAssetRef {
  readonly assetId: string;
  readonly uri: string;
  readonly mimeType: string;
  readonly previewUri?: string;
  readonly previewDiagnostic?: string;
  readonly contentLocator?: ContentLocator;
  readonly label?: string;
  readonly timestampMs?: number;
}
