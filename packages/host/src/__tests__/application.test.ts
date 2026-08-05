import { describe, expect, it, vi } from 'vitest';
import {
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
  applicationId: 'neko-desktop',
  instanceId: 'desktop-instance-1',
};

describe('Neko application contracts', () => {
  it('parses known application identity and rejects unknown application identity', () => {
    expect(parseNekoApplicationIdentity(desktopIdentity)).toEqual(desktopIdentity);
    expectContractError(
      () => parseNekoApplicationIdentity({ ...desktopIdentity, version: '0.0.1' }),
      'invalid-application-contract',
    );
    for (const applicationId of ['neko-vscode', 'neko-tui', 'neko-studio', 'neko-home']) {
      expectContractError(
        () => parseNekoApplicationIdentity({ ...desktopIdentity, applicationId }),
        'unknown-application-identity',
      );
    }
  });

  it('requires explicit workspace identity and never falls back to an active workspace', () => {
    expectContractError(
      () =>
        parseNekoApplicationHandoffRequest({
          requestId: 'handoff-1',
          source: desktopIdentity,
          target: { toolId: 'desktop-native-tool' },
        }),
      'invalid-application-contract',
    );
  });

  it('rejects stale application instance handoffs', () => {
    expectContractError(
      () =>
        parseNekoApplicationHandoffRequest(
          {
            requestId: 'handoff-1',
            source: { ...desktopIdentity, instanceId: 'stale-desktop' },
            target: { toolId: 'desktop-native-tool', workspaceId: 'workspace-1' },
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
          requestId: 'handoff-1',
          source: desktopIdentity,
          target: {
            toolId: 'desktop-native-tool',
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
        sourceApplicationId: 'standalone-v0',
        targetApplicationId: 'neko-desktop',
        entries,
      }),
    ).toEqual([]);

    const diagnostics = validateNekoApplicationStorageMigrationPlan({
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
    requestId: 'handoff-1',
    source: desktopIdentity,
    target: { toolId: 'desktop-native-tool', workspaceId: 'workspace-1' },
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
