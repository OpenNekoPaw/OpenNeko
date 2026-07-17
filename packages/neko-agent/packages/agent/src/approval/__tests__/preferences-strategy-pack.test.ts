import { describe, it, expect } from 'vitest';
import { createApprovalEngine } from '../approval-engine';
import { createPreferencesStrategyPacks } from '../strategies/preferences-strategy-pack';
import { executionStrategyPack } from '../strategies/execution-strategy-pack';
import { creationStrategyPack } from '../strategies/creation-strategy-pack';
import { emptyPreferences } from '../../workspace/preferences-parser';
import type { ApprovalRequest } from '../approval-types';
import type { UserPreferences } from '@neko-agent/types';

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    channel: 'permission',
    paradigm: 'imperative',
    subject: {
      kind: 'tool:GenerateImage',
      label: 'Generate image',
      destructive: false,
      idempotent: true,
    },
    id: 'req-1',
    at: 0,
    ...overrides,
  };
}

function prefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return { ...emptyPreferences('project', '/p'), ...overrides };
}

describe('preferencesStrategyPack — alwaysApprove → escalate', () => {
  it('matches tool:<name> and returns escalate', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(
          prefs({
            alwaysApprove: [{ kind: 'tool', value: 'GenerateImage', source: 'tool:GenerateImage' }],
          }),
        ),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(makeRequest());
    expect(res.resolution).toBe('escalate');
    expect(res.reason).toBe('preferences-always-approve');
  });

  it('forces escalation even when default pack would auto-accept', async () => {
    // Default execution pack auto-accepts idempotent + non-destructive.
    // With alwaysApprove matching, preferences pack escalates first.
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(
          prefs({
            alwaysApprove: [{ kind: 'tool', value: 'GenerateImage', source: 'tool:GenerateImage' }],
          }),
        ),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(makeRequest());
    expect(res.resolution).toBe('escalate'); // not auto-accept
  });

  it('wildcard `- *` matches everything', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(
          prefs({ alwaysApprove: [{ kind: 'any', value: '', source: '*' }] }),
        ),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(makeRequest());
    expect(res.resolution).toBe('escalate');
  });

  it('domain match via context.domain', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(
          prefs({
            alwaysApprove: [{ kind: 'domain', value: 'publish', source: 'domain:publish' }],
          }),
        ),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(makeRequest({ context: { domain: 'publish' } }));
    expect(res.resolution).toBe('escalate');
  });

  it('channel match', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(
          prefs({
            alwaysApprove: [
              { kind: 'channel', value: 'creator-review', source: 'channel:creator-review' },
            ],
          }),
        ),
        creationStrategyPack,
      ],
    });
    const res = await engine.evaluate(
      makeRequest({
        channel: 'creator-review',
        context: {
          contentDigest: 'sha256:creator-review',
          documentUri: 'file:///workspace/plan.md',
        },
        paradigm: 'declarative',
        subject: { kind: 'proposal:x', label: 'x', idempotent: true, destructive: false },
      }),
    );
    expect(res.resolution).toBe('escalate');
  });

  it('label substring match (case-insensitive)', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(
          prefs({
            alwaysApprove: [{ kind: 'label', value: '4k', source: '4K export' }],
          }),
        ),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(
      makeRequest({
        subject: { kind: 'tool:Export', label: 'Export 4K master', idempotent: false },
      }),
    );
    expect(res.resolution).toBe('escalate');
  });
});

describe('preferencesStrategyPack — cost thresholds → escalate', () => {
  it('tokens breach escalates', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(prefs({ costThresholds: { maxTokens: 1000 } })),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(makeRequest({ context: { tokens: 5000 } }));
    expect(res.resolution).toBe('escalate');
    expect(res.reason).toBe('preferences-cost-threshold');
    expect(res.note).toContain('tokens 5000');
  });

  it('usd breach escalates', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(prefs({ costThresholds: { maxUsd: 5 } })),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(makeRequest({ context: { usd: 10 } }));
    expect(res.resolution).toBe('escalate');
    expect(res.note).toContain('usd 10');
  });

  it('durationMs breach escalates', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(prefs({ costThresholds: { maxDurationMs: 60_000 } })),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(makeRequest({ context: { durationMs: 120_000 } }));
    expect(res.resolution).toBe('escalate');
  });

  it('below threshold does not escalate', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(prefs({ costThresholds: { maxTokens: 10_000 } })),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(makeRequest({ context: { tokens: 500 } }));
    // Falls through to execution pack which auto-accepts the default request.
    expect(res.resolution).toBe('auto-accept');
  });

  it('missing context value → threshold skipped (no escalation)', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(prefs({ costThresholds: { maxTokens: 1 } })),
        executionStrategyPack,
      ],
    });
    // No context at all → tokens axis skipped → falls through to default pack.
    const res = await engine.evaluate(makeRequest());
    expect(res.resolution).toBe('auto-accept');
  });
});

describe('preferencesStrategyPack — autoApprove (only non-destructive)', () => {
  it('auto-accepts matching non-destructive subject', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(
          prefs({ autoApprove: [{ kind: 'tool', value: 'Read', source: 'tool:Read' }] }),
        ),
        // Without preferences, execution pack would auto-accept
        // idempotent+non-destructive anyway — we verify preferences
        // is the one deciding via the reason field.
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(
      makeRequest({
        subject: { kind: 'tool:Read', label: 'Read', destructive: false, idempotent: true },
      }),
    );
    expect(res.resolution).toBe('auto-accept');
    expect(res.reason).toBe('preferences-auto-approve');
  });

  it('refuses to auto-accept destructive subject (L0 gate preserved)', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(
          prefs({ autoApprove: [{ kind: 'tool', value: 'DeleteAll', source: 'tool:DeleteAll' }] }),
        ),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(
      makeRequest({
        subject: {
          kind: 'tool:DeleteAll',
          label: 'DeleteAll',
          destructive: true,
          idempotent: false,
        },
      }),
    );
    // Preferences defers; execution pack auto-rejects destructive+non-idempotent.
    expect(res.resolution).toBe('auto-reject');
  });

  it('alwaysApprove takes priority over autoApprove on the same subject', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        ...createPreferencesStrategyPacks(
          prefs({
            alwaysApprove: [{ kind: 'tool', value: 'Read', source: 'tool:Read (always)' }],
            autoApprove: [{ kind: 'tool', value: 'Read', source: 'tool:Read (auto)' }],
          }),
        ),
        executionStrategyPack,
      ],
    });
    const res = await engine.evaluate(
      makeRequest({
        subject: { kind: 'tool:Read', label: 'Read', destructive: false, idempotent: true },
      }),
    );
    // Escalation wins over auto-accept.
    expect(res.resolution).toBe('escalate');
  });
});

describe('preferencesStrategyPack — empty prefs = transparent', () => {
  it('empty preferences defers to default packs', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [...createPreferencesStrategyPacks(prefs()), executionStrategyPack],
    });
    const res = await engine.evaluate(makeRequest());
    expect(res.resolution).toBe('auto-accept');
    // Reason comes from the execution pack, not preferences.
    expect(res.reason).not.toContain('preferences');
  });
});
