export type PrimitiveDensity = 'compact' | 'default';
export type PrimitiveSize = 'xs' | 'sm' | 'md';
export type PrimitiveVariant = 'default' | 'ghost' | 'secondary' | 'danger';

export interface PrimitiveBaseProps {
  readonly density?: PrimitiveDensity;
  readonly size?: PrimitiveSize;
  readonly variant?: PrimitiveVariant;
}
