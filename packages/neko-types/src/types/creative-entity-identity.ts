export const CREATIVE_ENTITY_KINDS = ['character', 'scene', 'object', 'location', 'style'] as const;

export type CreativeEntityKind = (typeof CREATIVE_ENTITY_KINDS)[number];

export function isCreativeEntityKind(value: unknown): value is CreativeEntityKind {
  return CREATIVE_ENTITY_KINDS.some((kind) => kind === value);
}
