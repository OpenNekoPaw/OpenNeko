import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../../types/storage';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { M1_LOCAL_METADATA_MIGRATIONS, MARKET_INSTALLATION_MIGRATIONS } from '../sqlite';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Market installation repository', () => {
  it('persists a portable install receipt and trust snapshot across store reopen', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-market-installation-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const first = createNodeSqliteLocalMetadataStore({ homedir });
    await first.open({ databasePath, busyTimeoutMs: 1_000 });
    await first.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await first.migrateNamespace(MARKET_INSTALLATION_MIGRATIONS);

    const record = {
      packageId: '@studio/storyboard',
      version: '1.2.0',
      type: 'skill' as const,
      installedAt: 1_786_000_000_000,
      installLocation: '${HOME}/.agents/skills/studio/storyboard',
      manifest: {
        id: '@studio/storyboard',
        name: 'storyboard',
        version: '1.2.0',
        type: 'skill' as const,
        source: {
          kind: 'registry' as const,
          registry: 'official',
          package: '@studio/storyboard',
          version: '1.2.0',
          integrity: 'sha256-storyboard',
        },
        distributionKind: 'archive' as const,
        typeMetadata: { type: 'skill' as const, data: { domain: ['story'] } },
        intent: { useCases: ['storyboarding'] },
        createdAt: 1_785_000_000_000,
        updatedAt: 1_786_000_000_000,
      },
      source: null,
      enabled: true,
      requested: true,
      status: 'active' as const,
      expiresAt: null,
      graceEndsAt: null,
      lastUsedAt: null,
      compatibilityIssue: null,
      largeAsset: null,
      referenceOwners: ['@studio/creator-bundle'],
      trustDecision: {
        level: 'trusted' as const,
        source: 'vscode-workspace' as const,
        decidedAt: 1_786_000_000_000,
      },
      updatedAt: 1_786_000_000_000,
    };

    await first.repositories.marketInstallations.upsert(record);
    await first.dispose();

    const reopened = createNodeSqliteLocalMetadataStore({ homedir });
    await reopened.open({ databasePath, busyTimeoutMs: 1_000 });
    await reopened.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await reopened.migrateNamespace(MARKET_INSTALLATION_MIGRATIONS);

    await expect(reopened.repositories.marketInstallations.get(record.packageId)).resolves.toEqual(
      record,
    );
    await expect(reopened.repositories.marketInstallations.list()).resolves.toEqual([record]);
    await reopened.dispose();
  });

  it('rejects an absolute installation location', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-market-installation-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(MARKET_INSTALLATION_MIGRATIONS);

    await expect(
      store.repositories.marketInstallations.upsert({
        packageId: '@studio/absolute',
        version: '1.0.0',
        type: 'skill',
        installedAt: 1,
        installLocation: '/Users/test/.agents/skills/studio/absolute',
        manifest: {
          id: '@studio/absolute',
          name: 'absolute',
          version: '1.0.0',
          type: 'skill',
          source: {
            kind: 'registry',
            registry: 'official',
            package: '@studio/absolute',
            version: '1.0.0',
            integrity: 'sha256-absolute',
          },
          distributionKind: 'archive',
          typeMetadata: { type: 'skill', data: { domain: ['test'] } },
          intent: { useCases: ['test'] },
          createdAt: 1,
          updatedAt: 1,
        },
        source: null,
        enabled: true,
        requested: true,
        status: 'active',
        expiresAt: null,
        graceEndsAt: null,
        lastUsedAt: null,
        compatibilityIssue: null,
        largeAsset: null,
        referenceOwners: [],
        trustDecision: null,
        updatedAt: 1,
      }),
    ).rejects.toMatchObject({
      code: 'metadata-transaction-failed',
      operation: 'upsert-market-installation',
    });
    await store.dispose();
  });

  it('rejects nested provider secrets before writing an installation receipt', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-market-installation-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(MARKET_INSTALLATION_MIGRATIONS);
    const manifest = {
      id: '@studio/secret-bearing',
      name: 'secret-bearing',
      version: '1.0.0',
      type: 'skill' as const,
      source: {
        kind: 'registry' as const,
        registry: 'official',
        package: '@studio/secret-bearing',
        version: '1.0.0',
        integrity: 'sha256-secret-bearing',
      },
      distributionKind: 'archive' as const,
      typeMetadata: { type: 'skill' as const, data: { domain: ['test'] } },
      intent: { useCases: ['test'] },
      createdAt: 1,
      updatedAt: 1,
      providerRuntime: { apiKey: 'must-not-enter-sqlite' },
    };

    await expect(
      store.repositories.marketInstallations.upsert({
        packageId: manifest.id,
        version: manifest.version,
        type: manifest.type,
        installedAt: 1,
        installLocation: '${HOME}/.agents/skills/studio/secret-bearing',
        manifest,
        source: null,
        enabled: true,
        requested: true,
        status: 'active',
        expiresAt: null,
        graceEndsAt: null,
        lastUsedAt: null,
        compatibilityIssue: null,
        largeAsset: null,
        referenceOwners: [],
        trustDecision: null,
        updatedAt: 1,
      }),
    ).rejects.toMatchObject({
      code: 'metadata-secret-forbidden',
      operation: 'upsert-market-installation',
    });
    await expect(store.repositories.marketInstallations.get(manifest.id)).resolves.toBeNull();
    await store.dispose();
  });
});
