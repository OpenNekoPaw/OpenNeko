import type { VariantAttributes } from '@neko/shared';

export interface AssetDiffVariantState {
  id: string;
  name: string;
  attributes: VariantAttributes;
  fileCount: number;
  fileName: string | null;
  filePath: string | null;
}

export interface AssetDiffInitialState {
  entity: {
    id: string;
    name: string;
    category: string;
  };
  variantA: AssetDiffVariantState;
  variantB: AssetDiffVariantState;
  imageUriA: string | null;
  imageUriB: string | null;
}

export interface AssetDiffAttributeDiff {
  attribute: keyof VariantAttributes;
  valueA: string | undefined;
  valueB: string | undefined;
}

export interface AssetDiffResultPayload {
  similarity: number;
  attributeDiffs: AssetDiffAttributeDiff[];
}

export type AssetDiffViewMode = 'side-by-side' | 'slider' | 'overlay';
export type AssetDiffTab = 'media' | 'attributes' | 'ai';
