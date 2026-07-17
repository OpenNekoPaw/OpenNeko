import type {
  CharacterRecord,
  CharacterRecordMetadata,
  CreativeEntity,
  CreativeEntityKind,
  CreativeEntityQuery,
} from '@neko/shared';
import { collectCharacterLookupKeys, normalizeCharacterLookupKey } from '@neko/shared';

export interface CreativeEntityAdapter {
  list(query?: CreativeEntityQuery): Promise<readonly CreativeEntity[]>;
  get(id: string): Promise<CreativeEntity | undefined>;
  resolveByName(name: string, kind?: CreativeEntityKind): Promise<CreativeEntity | undefined>;
}

export function characterRecordToCreativeEntity(record: CharacterRecord): CreativeEntity {
  return {
    id: record.id,
    kind: 'character',
    canonicalName: record.canonicalName,
    displayName: record.displayName,
    aliases: record.aliases,
    status: record.status,
    metadata: record.metadata ? { ...record.metadata } : undefined,
  };
}

export function creativeEntityToCharacterRecord(
  entity: CreativeEntity,
  existing?: CharacterRecord,
): CharacterRecord {
  if (entity.kind !== 'character') {
    throw new Error(`Cannot write ${entity.kind} as a characters.json record.`);
  }
  return {
    id: entity.id,
    canonicalName: entity.canonicalName,
    displayName: entity.displayName,
    aliases: entity.aliases,
    status: entity.status,
    metadata: pickCharacterMetadata(entity.metadata) ?? existing?.metadata,
    defaults: existing?.defaults,
    bindings: existing?.bindings,
  };
}

export function matchesCreativeEntityQuery(
  entity: CreativeEntity,
  query: CreativeEntityQuery = {},
): boolean {
  if (query.kind && entity.kind !== query.kind) {
    return false;
  }
  if (query.status && entity.status !== query.status) {
    return false;
  }

  const key = query.text ? normalizeCharacterLookupKey(query.text) : '';
  if (!key) {
    return true;
  }

  return collectCreativeEntityLookupKeys(entity).includes(key);
}

export function collectCreativeEntityLookupKeys(entity: CreativeEntity): readonly string[] {
  if (entity.kind === 'character') {
    return collectCharacterLookupKeys({
      id: entity.id,
      canonicalName: entity.canonicalName,
      displayName: entity.displayName,
      aliases: entity.aliases,
      status: entity.status,
    });
  }

  return [entity.canonicalName, entity.displayName, ...entity.aliases]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(normalizeCharacterLookupKey);
}

export function buildEntityId(kind: CreativeEntityKind, name: string): string {
  const prefix = kind === 'character' ? 'char' : kind;
  return `${prefix}_${stableIdPart(name)}`;
}

export function stableIdPart(value: string): string {
  const normalized = value.trim().normalize('NFC').toLocaleLowerCase().replace(/\s+/g, '-');
  const slug = normalized.replace(/[^\p{Letter}\p{Number}_-]+/gu, '-').replace(/-+/g, '-');
  return (slug.replace(/^-|-$/g, '') || 'entity').slice(0, 96);
}

export function normalizeAliasList(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeCharacterLookupKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(trimmed);
  }
  return aliases;
}

function pickCharacterMetadata(
  metadata: Record<string, unknown> | undefined,
): CharacterRecordMetadata | undefined {
  if (!metadata) return undefined;
  return { ...metadata };
}
