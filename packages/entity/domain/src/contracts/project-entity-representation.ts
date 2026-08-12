export const ENTITY_REPRESENTATION_ROLES = [
  'portrait',
  'reference',
  'live2d',
  'live3d',
  'voice',
  'motion',
  'style',
] as const;

export type EntityRepresentationRole = (typeof ENTITY_REPRESENTATION_ROLES)[number];

export function isEntityRepresentationRole(value: unknown): value is EntityRepresentationRole {
  return ENTITY_REPRESENTATION_ROLES.some((role) => role === value);
}
