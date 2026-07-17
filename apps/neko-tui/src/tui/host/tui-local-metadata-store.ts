import type { LocalMetadataStore } from '@neko/shared';

export async function createTuiLocalMetadataStore(homedir: string): Promise<LocalMetadataStore> {
  if (Reflect.has(globalThis, 'Bun')) {
    const { createBunSqliteLocalMetadataStore } = await import('./bun-sqlite-local-metadata-store');
    return createBunSqliteLocalMetadataStore({ homedir });
  }
  const { createNodeSqliteLocalMetadataStore } =
    await import('@neko/shared/local-metadata/node-sqlite-local-metadata-store');
  return createNodeSqliteLocalMetadataStore({ homedir });
}
