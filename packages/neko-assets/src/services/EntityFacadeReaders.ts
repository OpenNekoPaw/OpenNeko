import * as vscode from 'vscode';
import {
  collectCharacterLookupKeys,
  ENTITY_FACADE_COMMANDS,
  isCreativeEntity,
  isEntityAssetBinding,
  type CharacterRecord,
  type CreativeEntity,
  type EntityAssetBinding,
} from '@neko/shared';
import { parseProjectAssetEntityId } from '@neko/asset';
import type {
  CharacterRegistryReader,
  EntityAssetBindingReader,
} from './CharacterAssetExportService';

export interface EntityFacadeReaderOptions {
  readonly projectRoot: string;
  readonly executeCommand?: typeof vscode.commands.executeCommand;
}

export interface EntityFacadeAssetBindingReader extends EntityAssetBindingReader {
  listForProjectAsset(entityId: string): Promise<readonly EntityAssetBinding[]>;
}

export interface EntityFacadeCharacterReader extends CharacterRegistryReader {
  resolveByName(name: string): Promise<CharacterRecord | undefined>;
}

export interface EntityFacadeReaders {
  readonly characters: EntityFacadeCharacterReader;
  readonly bindings: EntityFacadeAssetBindingReader;
}

export function createEntityFacadeReaders(options: EntityFacadeReaderOptions): EntityFacadeReaders {
  const executeCommand = options.executeCommand ?? vscode.commands.executeCommand;
  const listEntities = async (): Promise<readonly CreativeEntity[]> => {
    const result = await executeCommand<unknown>(ENTITY_FACADE_COMMANDS.listEntities, {
      projectRoot: options.projectRoot,
      query: { kind: 'character' },
    });
    return Array.isArray(result) ? result.filter(isCreativeEntity) : [];
  };

  const listBindings = async (request: { readonly assetRef?: string } = {}) => {
    const result = await executeCommand<unknown>(ENTITY_FACADE_COMMANDS.listBindings, {
      projectRoot: options.projectRoot,
      ...request,
    });
    return Array.isArray(result) ? result.filter(isEntityAssetBinding) : [];
  };

  const characters: EntityFacadeCharacterReader = {
    async list() {
      const entities = await listEntities();
      return entities
        .filter((entity) => entity.kind === 'character' && entity.status !== 'deprecated')
        .map(entityToCharacterRecord);
    },
    async resolveByName(name) {
      const records = await this.list();
      const lookup = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      return records.find((record) => collectCharacterLookupKeys(record).includes(lookup));
    },
  };

  const bindings: EntityFacadeAssetBindingReader = {
    list: listBindings,
    async listForProjectAsset(entityId) {
      const assetRef = `project://assets/${entityId}`;
      const bindingsByCommand = await listBindings({ assetRef });
      if (bindingsByCommand.length > 0) return bindingsByCommand;
      return (await listBindings()).filter(
        (binding) => parseProjectAssetEntityId(binding.assetRef) === entityId,
      );
    },
  };

  return { characters, bindings };
}

function entityToCharacterRecord(entity: CreativeEntity): CharacterRecord {
  const defaults = readCharacterDefaults(entity.metadata);
  const bindings = readCharacterBindings(entity.metadata);
  return {
    id: entity.id,
    canonicalName: entity.canonicalName,
    ...(entity.displayName ? { displayName: entity.displayName } : {}),
    aliases: entity.aliases,
    status: entity.status,
    ...(entity.metadata ? { metadata: entity.metadata } : {}),
    ...(defaults ? { defaults } : {}),
    ...(bindings ? { bindings } : {}),
  };
}

function readCharacterDefaults(
  metadata: Record<string, unknown> | undefined,
): CharacterRecord['defaults'] | undefined {
  if (!metadata) return undefined;
  const source = metadata['defaults'];
  if (!isRecord(source)) return undefined;
  const defaults = {
    assetEntityId: readString(source['assetEntityId']),
    galleryNodeId: readString(source['galleryNodeId']),
    voiceAssetId: readString(source['voiceAssetId']),
  };
  return Object.values(defaults).some((value) => value !== undefined) ? defaults : undefined;
}

function readCharacterBindings(
  metadata: Record<string, unknown> | undefined,
): CharacterRecord['bindings'] | undefined {
  if (!metadata) return undefined;
  const source = metadata['bindings'];
  if (!isRecord(source)) return undefined;
  const bindings = {
    assetEntityIds: readStringArray(source['assetEntityIds']),
    galleryNodeIds: readStringArray(source['galleryNodeIds']),
    generatedAssetIds: readStringArray(source['generatedAssetIds']),
    scriptNames: readStringArray(source['scriptNames']),
  };
  return Object.values(bindings).some((value) => value !== undefined) ? bindings : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return items.length > 0 ? items : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
