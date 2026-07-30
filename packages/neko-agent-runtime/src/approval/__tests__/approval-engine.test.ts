/**
 * ApprovalEngine + strategy pack tests (P4)
 *
 * Covers:
 * - Ring-specific pack precedence over shared pack
 * - Shared pack runs when ring pack declines
 * - User prompt invoked only when no pack decided
 * - User prompt throw → auto-reject with 'no-decision'
 * - Creation pack: creator review is user-decided through generic context
 * - Execution pack: idempotent + non-destructive → auto-accept
 * - Execution pack: destructive + non-idempotent → auto-reject
 * - Execution pack: quality-gate verdict routing
 */

import { describe, it, expect, vi } from 'vitest';
import { createApprovalEngine } from '../approval-engine';
import { creationStrategyPack } from '../strategies/creation-strategy-pack';
import { executionStrategyPack } from '../strategies/execution-strategy-pack';
import type { ApprovalRequest, ApprovalResponse, StrategyPack } from '../approval-types';

function request(
  overrides: Partial<ApprovalRequest> &
    Partial<{ kind: string; label: string; destructive: boolean; idempotent: boolean }> = {},
): ApprovalRequest {
  const { kind = 'tool:x', label = 'X', destructive, idempotent, ...rest } = overrides;
  return {
    channel: 'permission',
    paradigm: 'imperative',
    subject: { kind, label, destructive, idempotent },
    id: rest.id ?? 'req-1',
    at: rest.at ?? 0,
    ...rest,
  };
}

describe('ApprovalEngine', () => {
  it('ring-specific pack takes precedence over shared pack', async () => {
    const ring: StrategyPack = {
      name: 'ring',
      scope: 'imperative',
      evaluate: () => ({
        requestId: 'req-1',
        resolution: 'auto-accept',
        reason: 'ring-pick',
        decidedAt: 0,
      }),
    };
    const shared: StrategyPack = {
      name: 'shared',
      scope: 'shared',
      evaluate: () =>
        ({
          requestId: 'req-1',
          resolution: 'auto-reject',
          reason: 'shared-pick',
          decidedAt: 0,
        }) satisfies ApprovalResponse,
    };
    const engine = createApprovalEngine({ strategyPacks: [shared, ring] });
    const res = await engine.evaluate(request());
    expect(res.reason).toBe('ring-pick');
  });

  it('shared pack runs when ring pack returns undefined', async () => {
    const ring: StrategyPack = {
      name: 'ring',
      scope: 'imperative',
      evaluate: () => undefined,
    };
    const shared: StrategyPack = {
      name: 'shared',
      scope: 'shared',
      evaluate: () => ({
        requestId: 'req-1',
        resolution: 'auto-accept',
        reason: 'shared-pick',
        decidedAt: 0,
      }),
    };
    const engine = createApprovalEngine({ strategyPacks: [ring, shared] });
    const res = await engine.evaluate(request());
    expect(res.reason).toBe('shared-pick');
  });

  it('user prompt runs when no pack decides', async () => {
    const prompt = vi.fn(async (req: ApprovalRequest) => ({
      requestId: req.id,
      resolution: 'user-accept' as const,
      reason: 'user-said-yes',
      decidedAt: 7,
    }));
    const engine = createApprovalEngine({ userPrompt: prompt });
    const res = await engine.evaluate(request());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(res.resolution).toBe('user-accept');
  });

  it('user prompt throw → no-decision auto-reject', async () => {
    const engine = createApprovalEngine({
      userPrompt: async () => {
        throw new Error('UI broken');
      },
    });
    const res = await engine.evaluate(request());
    expect(res.resolution).toBe('auto-reject');
    expect(res.reason).toBe('no-decision');
  });

  it('strategy pack throw does not break the pipeline', async () => {
    const bad: StrategyPack = {
      name: 'bad',
      scope: 'imperative',
      evaluate: () => {
        throw new Error('bug');
      },
    };
    const ok: StrategyPack = {
      name: 'ok',
      scope: 'imperative',
      evaluate: () => ({
        requestId: 'req-1',
        resolution: 'auto-accept',
        reason: 'ok-pick',
        decidedAt: 0,
      }),
    };
    const engine = createApprovalEngine({ strategyPacks: [bad, ok] });
    const res = await engine.evaluate(request());
    expect(res.reason).toBe('ok-pick');
  });

  describe('onDecision', () => {
    it('notifies listeners on auto-accept', async () => {
      const pack: StrategyPack = {
        name: 'always',
        scope: 'imperative',
        evaluate: () => ({
          requestId: 'req-1',
          resolution: 'auto-accept',
          reason: 'ok',
          decidedAt: 0,
        }),
      };
      const engine = createApprovalEngine({ strategyPacks: [pack] });
      const seen: Array<{ req: ApprovalRequest; res: ApprovalResponse }> = [];
      engine.onDecision((req, res) => seen.push({ req, res }));

      await engine.evaluate(request({ kind: 'tool:x' }));
      await engine.evaluate(request({ kind: 'tool:y', id: 'req-2' }));

      expect(seen).toHaveLength(2);
      expect(seen[0]!.req.subject.kind).toBe('tool:x');
      expect(seen[0]!.res.resolution).toBe('auto-accept');
    });

    it('notifies on the no-decision auto-reject path too', async () => {
      const engine = createApprovalEngine();
      const seen: ApprovalResponse[] = [];
      engine.onDecision((_, res) => seen.push(res));

      await engine.evaluate(request());

      expect(seen).toHaveLength(1);
      expect(seen[0]!.resolution).toBe('auto-reject');
      expect(seen[0]!.reason).toBe('no-decision');
    });

    it('unsubscribe stops further notifications', async () => {
      const engine = createApprovalEngine();
      const seen: ApprovalResponse[] = [];
      const unsub = engine.onDecision((_, res) => seen.push(res));

      await engine.evaluate(request());
      unsub();
      await engine.evaluate(request({ id: 'req-2' }));

      expect(seen).toHaveLength(1);
    });

    it('listener exceptions do not break the engine', async () => {
      const engine = createApprovalEngine();
      engine.onDecision(() => {
        throw new Error('boom');
      });
      const seen: ApprovalResponse[] = [];
      engine.onDecision((_, res) => seen.push(res));

      await engine.evaluate(request());

      expect(seen).toHaveLength(1);
    });
  });
});

describe('creationStrategyPack', () => {
  it('passes generic creator-review context to the user prompt', async () => {
    const prompt = vi.fn(async (approvalRequest: ApprovalRequest) => ({
      requestId: approvalRequest.id,
      resolution: 'user-accept' as const,
      reason: 'creator-approved',
      decidedAt: 10,
    }));
    const engine = createApprovalEngine({
      strategyPacks: [creationStrategyPack],
      userPrompt: prompt,
    });
    const res = await engine.evaluate(
      request({
        channel: 'creator-review',
        context: {
          documentUri: 'file:///workspace/plan.md',
          contentDigest: 'sha256:creator-review-1',
        },
        paradigm: 'declarative',
        idempotent: true,
        destructive: false,
      }),
    );
    expect(res.resolution).toBe('user-accept');
    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          documentUri: 'file:///workspace/plan.md',
          contentDigest: 'sha256:creator-review-1',
        },
      }),
    );
  });

  it('does not let creator review bypass a later destructive Tool approval', async () => {
    const prompt = vi.fn(async (approvalRequest: ApprovalRequest) => ({
      requestId: approvalRequest.id,
      resolution: 'user-accept' as const,
      reason: 'creator-approved',
      decidedAt: 10,
    }));
    const engine = createApprovalEngine({
      strategyPacks: [creationStrategyPack, executionStrategyPack],
      userPrompt: prompt,
    });

    await engine.evaluate(
      request({
        id: 'review-1',
        channel: 'creator-review',
        paradigm: 'declarative',
        context: { contentDigest: 'sha256:creator-review-1' },
      }),
    );
    const operation = await engine.evaluate(
      request({
        id: 'tool-1',
        channel: 'permission',
        paradigm: 'imperative',
        destructive: true,
        idempotent: false,
      }),
    );

    expect(operation).toMatchObject({
      requestId: 'tool-1',
      resolution: 'auto-reject',
      reason: 'destructive-and-non-idempotent',
    });
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('auto-accepts non-destructive permission requests', async () => {
    const engine = createApprovalEngine({ strategyPacks: [creationStrategyPack] });
    const res = await engine.evaluate(
      request({ channel: 'permission', paradigm: 'declarative', destructive: false }),
    );
    expect(res.resolution).toBe('auto-accept');
    expect(res.reason).toBe('non-destructive-read');
  });
});

describe('executionStrategyPack', () => {
  it('auto-accepts idempotent + non-destructive tool calls', async () => {
    const engine = createApprovalEngine({ strategyPacks: [executionStrategyPack] });
    const res = await engine.evaluate(
      request({ channel: 'permission', paradigm: 'imperative', idempotent: true }),
    );
    expect(res.resolution).toBe('auto-accept');
    expect(res.reason).toBe('idempotent-non-destructive');
  });

  it('auto-rejects destructive + non-idempotent tools', async () => {
    const engine = createApprovalEngine({ strategyPacks: [executionStrategyPack] });
    const res = await engine.evaluate(
      request({
        channel: 'permission',
        paradigm: 'imperative',
        destructive: true,
        idempotent: false,
      }),
    );
    expect(res.resolution).toBe('auto-reject');
    expect(res.reason).toBe('destructive-and-non-idempotent');
  });

  it('quality gate: pass / warn / fail routing', async () => {
    const engine = createApprovalEngine({ strategyPacks: [executionStrategyPack] });

    const pass = await engine.evaluate(
      request({ channel: 'quality-gate', paradigm: 'imperative', context: { verdict: 'pass' } }),
    );
    expect(pass.resolution).toBe('auto-accept');

    const warn = await engine.evaluate(
      request({ channel: 'quality-gate', paradigm: 'imperative', context: { verdict: 'warn' } }),
    );
    expect(warn.resolution).toBe('escalate');

    const fail = await engine.evaluate(
      request({ channel: 'quality-gate', paradigm: 'imperative', context: { verdict: 'fail' } }),
    );
    expect(fail.resolution).toBe('auto-reject');
  });
});
