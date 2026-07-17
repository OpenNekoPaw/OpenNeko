/** Character-session policy is character-domain state, not an Agent runtime contract. */
export type CharacterModelTier = 'fast' | 'balanced' | 'powerful';

export type CharacterToolPolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'all' }
  | { readonly kind: 'allow-list'; readonly tools: readonly string[] };
