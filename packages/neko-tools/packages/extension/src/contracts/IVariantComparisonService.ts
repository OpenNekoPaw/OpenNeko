import type { VariantComparisonResult } from '@neko/shared';

export interface IVariantComparisonService {
  compare(
    entityId: string,
    variantIdA: string,
    variantIdB: string,
  ): Promise<VariantComparisonResult>;
}
