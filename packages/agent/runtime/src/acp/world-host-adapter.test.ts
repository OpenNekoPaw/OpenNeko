import { describe, expect, it, vi } from 'vitest';
import { WorldDshHostAdapter } from './world-host-adapter';

describe('World DSH Host adapter', () => {
  it('dispatches the canonical World Tool and preserves bounded facts', async () => {
    const query = vi.fn(async () => ({
      worldProjectId: 'world-1',
      title: 'Aster',
      reviewStatus: 'draft' as const,
      isFreshTarget: true,
      draft: {
        hasBackground: false,
        worldBookCount: 0,
        locationCount: 0,
        organizationCount: 0,
        ruleCount: 0,
        initialFactCount: 0,
      },
      sourceCount: 0,
      versionCount: 0,
      versions: [],
      versionsTruncated: false,
      createdAt: '2026-08-20T00:00:00.000Z',
      updatedAt: '2026-08-20T00:00:00.000Z',
    }));
    const adapter = new WorldDshHostAdapter({ query, fillDraft: vi.fn() });
    await expect(
      adapter.execute({
        sessionId: 'session-1',
        turn: 1,
        toolCallId: 'call-1',
        tool: 'openneko.world',
        operation: 'query',
        input: { worldProjectId: 'world-1' },
      }),
    ).resolves.toMatchObject({ outcome: 'success', result: { worldProjectId: 'world-1' } });
    expect(query).toHaveBeenCalledWith({ worldProjectId: 'world-1' }, undefined);
  });

  it('rejects another Tool identity before calling the owner', async () => {
    const query = vi.fn();
    const adapter = new WorldDshHostAdapter({ query, fillDraft: vi.fn() });
    await expect(
      adapter.execute({
        sessionId: 'session-1',
        turn: 1,
        toolCallId: 'call-1',
        tool: 'openneko.character',
        operation: 'query',
        input: { worldProjectId: 'world-1' },
      }),
    ).resolves.toEqual({
      outcome: 'failure',
      diagnostic: {
        code: 'WORLD_DSH_TOOL_MISMATCH',
        message: 'Expected openneko.world, received openneko.character.',
      },
    });
    expect(query).not.toHaveBeenCalled();
  });
});
