import { EntityRepresentationBindingService, ProjectEntityStore } from '@neko/entity-domain/core';
import type { CreativeEntity, EntityRepresentationBinding } from '@neko/entity-domain';

export interface ConfirmedEntityResources {
  readonly entities: readonly CreativeEntity[];
  readonly bindings: readonly EntityRepresentationBinding[];
}

export async function readConfirmedEntityResources(input: {
  readonly workspace: { readonly workspacePath: string };
  readonly host: { readonly files: { readText(filePath: string): Promise<string> } };
}): Promise<ConfirmedEntityResources> {
  const files = createReadOnlyEntityFiles(input.host);
  const entityStore = new ProjectEntityStore({
    projectRoot: input.workspace.workspacePath,
    ports: { files },
  });
  const bindingStore = EntityRepresentationBindingService.fromProjectRoot(
    input.workspace.workspacePath,
    { files },
  );
  const [entities, bindings] = await Promise.all([
    entityStore.list({ status: 'confirmed' }),
    bindingStore.list(),
  ]);
  return {
    entities,
    bindings: bindings.filter(
      (binding) => binding.status === 'confirmed' && binding.availability === 'active',
    ),
  };
}

function createReadOnlyEntityFiles(host: {
  readonly files: { readText(filePath: string): Promise<string> };
}) {
  return {
    async readJson(filePath: string): Promise<unknown | undefined> {
      try {
        return JSON.parse(await host.files.readText(filePath)) as unknown;
      } catch (error: unknown) {
        if (isNodeError(error, 'ENOENT')) return undefined;
        if (error instanceof SyntaxError) {
          throw new Error('Creative Entity data is malformed.');
        }
        throw error;
      }
    },
    async writeJson(): Promise<void> {
      throw new Error('Desktop Entity resource query is read-only.');
    },
  };
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
