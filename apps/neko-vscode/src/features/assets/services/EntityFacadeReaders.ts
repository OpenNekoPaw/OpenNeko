import * as vscode from 'vscode';
import {
  ENTITY_FACADE_COMMANDS,
  isCreativeEntity,
  isEntityRepresentationBinding,
  type CreativeEntity,
  type EntityRepresentationBinding,
} from '@neko/shared';

export interface EntityFacadeReaderOptions {
  readonly projectRoot: string;
  readonly executeCommand?: typeof vscode.commands.executeCommand;
}

export interface EntityFacadeCreativeEntityReader {
  list(): Promise<readonly CreativeEntity[]>;
  resolveByName(name: string): Promise<CreativeEntity | undefined>;
}

export interface EntityFacadeRepresentationBindingReader {
  list(): Promise<readonly EntityRepresentationBinding[]>;
}

export interface EntityFacadeReaders {
  readonly entities: EntityFacadeCreativeEntityReader;
  readonly bindings: EntityFacadeRepresentationBindingReader;
}

export function createEntityFacadeReaders(options: EntityFacadeReaderOptions): EntityFacadeReaders {
  const executeCommand = options.executeCommand ?? vscode.commands.executeCommand;

  const entities: EntityFacadeCreativeEntityReader = {
    async list() {
      const result = await executeCommand<unknown>(ENTITY_FACADE_COMMANDS.listEntities, {
        projectRoot: options.projectRoot,
        query: { kind: 'character' },
      });
      return Array.isArray(result)
        ? result.filter(isCreativeEntity).filter((entity) => entity.kind === 'character')
        : [];
    },
    async resolveByName(name) {
      const lookup = normalizeLookupKey(name);
      const records = await this.list();
      return records.find((entity) =>
        [entity.canonicalName, entity.displayName, ...entity.aliases]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => normalizeLookupKey(value) === lookup),
      );
    },
  };

  const bindings: EntityFacadeRepresentationBindingReader = {
    async list() {
      const result = await executeCommand<unknown>(ENTITY_FACADE_COMMANDS.listBindings, {
        projectRoot: options.projectRoot,
      });
      return Array.isArray(result) ? result.filter(isEntityRepresentationBinding) : [];
    },
  };

  return { entities, bindings };
}

function normalizeLookupKey(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}
