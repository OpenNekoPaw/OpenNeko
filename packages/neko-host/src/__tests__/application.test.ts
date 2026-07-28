import { describe, expect, it, vi } from 'vitest';
import {
  NEKO_APPLICATION_CONTRACT_VERSION,
  NEKO_APPLICATION_STORAGE_CATEGORIES,
  NekoApplicationContractError,
  parseNekoApplicationHandoffRequest,
  parseNekoApplicationIdentity,
  requireNekoApplicationHandoffPort,
  validateNekoApplicationStorageMigrationPlan,
  type NekoApplicationIdentity,
  type NekoApplicationStorageMigrationEntry,
} from '../application';

const desktopIdentity: NekoApplicationIdentity = {
  schemaVersion: NEKO_APPLICATION_CONTRACT_VERSION,
  applicationId: 'neko-desktop',
  instanceId: 'desktop-instance-1',
  version: '0.0.1',
};

describe('Neko application contracts', () => {
  it('parses known application identity and rejects unknown application identity', () => {
    expect(parseNekoApplicationIdentity(desktopIdentity)).toEqual(desktopIdentity);
    expectContractError(
      () => parseNekoApplicationIdentity({ ...desktopIdentity, applicationId: 'neko-studio' }),
      'unknown-application-identity',
    );
    expectContractError(
      () => parseNekoApplicationIdentity({ ...desktopIdentity, applicationId: 'neko-home' }),
      'unknown-application-identity',
    );
  });

  it('rejects unsupported schema versions', () => {
    expectContractError(
      () => parseNekoApplicationIdentity({ ...desktopIdentity, schemaVersion: 2 }),
      'unsupported-application-contract-version',
    );
  });

  it('requires explicit workspace identity and never falls back to an active workspace', () => {
    expectContractError(
      () =>
        parseNekoApplicationHandoffRequest({
          schemaVersion: 1,
          requestId: 'handoff-1',
          source: desktopIdentity,
          target: { toolId: 'neko-vscode' },
        }),
      'invalid-application-contract',
    );
  });

  it('rejects stale application instance handoffs', () => {
    expectContractError(
      () =>
        parseNekoApplicationHandoffRequest(
          {
            schemaVersion: 1,
            requestId: 'handoff-1',
            source: { ...desktopIdentity, instanceId: 'stale-desktop' },
            target: { toolId: 'neko-vscode', workspaceId: 'workspace-1' },
          },
          { expectedSource: desktopIdentity },
        ),
      'stale-application-instance',
    );
  });

  it('parses stable handoff identity without runtime path or active-window state', () => {
    expect(
      parseNekoApplicationHandoffRequest(
        {
          schemaVersion: 1,
          requestId: 'handoff-1',
          source: desktopIdentity,
          target: {
            toolId: 'neko-vscode',
            workspaceId: 'workspace-1',
            projectId: 'project-1',
            resourceId: 'resource-1',
            artifactId: 'artifact-1',
            taskId: 'task-1',
            editorId: 'neko.canvas',
          },
        },
        { expectedSource: desktopIdentity },
      ),
    ).toMatchObject({ requestId: 'handoff-1', target: { workspaceId: 'workspace-1' } });
  });

  it('fails visibly when the host does not register handoff capability', async () => {
    expectContractError(
      () => requireNekoApplicationHandoffPort(undefined),
      'missing-application-handoff-capability',
    );
    const handoff = vi.fn(async () => ({ accepted: true as const, requestId: 'handoff-1' }));
    await expect(
      requireNekoApplicationHandoffPort({ handoff }).handoff(validHandoff()),
    ).resolves.toEqual({ accepted: true, requestId: 'handoff-1' });
  });

  it('requires a complete, unique storage migration disposition for every category', () => {
    const entries: NekoApplicationStorageMigrationEntry[] = NEKO_APPLICATION_STORAGE_CATEGORIES.map(
      (category) => ({
        category,
        owner: `owner:${category}`,
        disposition: category === 'rebuildable-cache' ? 'rebuild' : 'reuse',
        sourceIdentity: `standalone-v0:${category}`,
        targetIdentity: `desktop:${category}`,
      }),
    );
    expect(
      validateNekoApplicationStorageMigrationPlan({
        schemaVersion: 1,
        sourceApplicationId: 'standalone-v0',
        targetApplicationId: 'neko-desktop',
        entries,
      }),
    ).toEqual([]);

    const diagnostics = validateNekoApplicationStorageMigrationPlan({
      schemaVersion: 1,
      sourceApplicationId: 'standalone-v0',
      targetApplicationId: 'neko-desktop',
      entries: entries.filter((entry) => entry.category !== 'credentials'),
    });
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-application-contract',
        message: expect.stringContaining("exactly one 'credentials'"),
      }),
    ]);
  });
});

function validHandoff() {
  return parseNekoApplicationHandoffRequest({
    schemaVersion: 1,
    requestId: 'handoff-1',
    source: desktopIdentity,
    target: { toolId: 'neko-vscode', workspaceId: 'workspace-1' },
  });
}

function expectContractError(operation: () => unknown, code: string): void {
  try {
    operation();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(NekoApplicationContractError);
    if (!(error instanceof NekoApplicationContractError)) {
      throw error;
    }
    expect(error.diagnostic.code).toBe(code);
    return;
  }
  throw new Error(`Expected NekoApplicationContractError '${code}'.`);
}
