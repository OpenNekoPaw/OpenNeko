import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNodeGeneratedOutputProjectionBinding,
  type GeneratedOutputProjectionRejection,
} from '@neko/shared/local-metadata/node';
import {
  migrateLegacyGeneratedAssetIndex,
  type GeneratedAssetIndexMigrationReport,
} from '@neko/platform/media/generated-asset-index';
import { createWorkspaceGeneratedAssetIndex } from './generatedAssetOpenResolver';

vi.mock('@neko/shared/local-metadata/node', () => ({
  createNodeGeneratedOutputProjectionBinding: vi.fn(),
}));

vi.mock('@neko/platform/media/generated-asset-index', () => ({
  GeneratedAssetIndex: class {
    constructor(
      private readonly store: {
        load(): Promise<readonly unknown[]>;
      },
    ) {}

    async load(): Promise<void> {
      await this.store.load();
    }
  },
  migrateLegacyGeneratedAssetIndex: vi.fn(),
}));

const rejection: GeneratedOutputProjectionRejection = {
  code: 'generated-output-projection-migration-required',
  resourceId: 'generated-output:legacy-output',
  message: 'Resource generated-output:legacy-output contains an invalid or legacy projection.',
};

describe('createWorkspaceGeneratedAssetIndex', () => {
  beforeEach(() => {
    vi.mocked(migrateLegacyGeneratedAssetIndex).mockResolvedValue({
      sourceStatus: 'absent',
      sourcePath: '/workspace/neko/generated/index.json',
      backupPath: null,
      archivedPath: null,
      quarantinePath: null,
      sourceDiagnostic: null,
      importedEntryCount: 0,
      verifiedEntryCount: 0,
    } satisfies GeneratedAssetIndexMigrationReport);
  });

  it('isolates and reports a rejected projection without failing standalone Host activation', async () => {
    const dispose = vi.fn(async () => undefined);
    const update = vi.fn(async () => [] as const);
    const load = vi.fn(async () => [] as const);
    vi.mocked(createNodeGeneratedOutputProjectionBinding).mockImplementation(async (options) => {
      const policy = Reflect.get(options, 'rejectedProjectionPolicy');
      if (typeof policy !== 'object' || policy === null) {
        throw new Error(
          'generated-output-projection-migration-required: Resource generated-output:legacy-output contains an invalid or legacy projection.',
        );
      }
      const report = Reflect.get(policy, 'report');
      if (typeof report !== 'function') {
        throw new Error('Expected a generated-output projection rejection reporter.');
      }
      report(rejection);
      return {
        store: { update, load },
        dispose,
      };
    });
    const logger = { warn: vi.fn() };

    const binding = await createWorkspaceGeneratedAssetIndex({
      workspaceRoot: '/workspace',
      homedir: '/home/test',
      logger,
    });

    expect(binding.rejectedProjections).toEqual([rejection]);
    expect(update).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      'Generated output projections were skipped during activation',
      { rejections: [rejection] },
    );
    await expect(binding.dispose()).resolves.toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
