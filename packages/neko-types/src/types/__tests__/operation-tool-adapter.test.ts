import { describe, expect, it } from 'vitest';
import type {
  IOperationToolAdapter,
  OperationTool,
  OperationToolAdapterContext,
  OperationToolIntent,
  OperationToolPlan,
} from '../operation-tool-adapter';
import {
  createOperationToolAdapterRegistry,
  createDomainRouter,
  getOperationToolCreativeDomain,
  isOperationTool,
  isOperationToolPlanTraceable,
  operationToolDomainMetadata,
} from '../operation-tool-adapter';
import {
  AUDIO_RENDER_SERVICE_PORT_ID,
  CREATIVE_DOMAIN_SERVICE_PORT_IDS,
  TIMELINE_RENDER_SERVICE_PORT_ID,
} from '../domain-routing';

const operationTool: OperationTool = {
  kind: 'operation',
  name: 'timeline.element.update',
  description: 'Update a timeline element via EditOperation.',
  category: 'timeline',
  parameters: { type: 'object', properties: {} },
  requiresConfirmation: true,
  traits: {
    cost: 'free',
    reversible: true,
    locality: 'local',
    impactLevel: 'low',
  },
  operation: {
    kind: 'operation',
    domain: 'timeline',
    editOperationTypes: ['element.update'],
    requiresRationale: true,
    reversible: true,
  },
};

function createOperationPlan(): OperationToolPlan {
  return {
    id: 'plan-update-shot-3',
    intentId: 'intent-update-shot-3',
    rationaleId: 'rat-shot-3-recovery-guidance',
    requiresUserApproval: false,
    reversible: true,
    createdAt: 1_771_718_408_000,
    operations: [
      {
        type: 'element.update',
        meta: {
          id: 'op-update-shot-3',
          timestamp: 1_771_718_408_000,
          source: 'ai',
          description: 'Update shot 3 prompt metadata.',
        },
        payload: {
          trackId: 'video-track-1',
          elementId: 'clip-3',
          updates: { name: 'Shot 3 — adjusted' },
        },
        before: { updates: { name: 'Shot 3' } },
      },
    ],
  };
}

describe('operation tool adapter contracts', () => {
  it('identifies Tool(kind=operation) metadata without a separate capability type', () => {
    expect(isOperationTool(operationTool)).toBe(true);
    expect(isOperationTool({ ...operationTool, perception: { kind: 'perception' } })).toBe(false);
    expect(
      isOperationTool({
        kind: 'perception',
        name: 'perception.image.classify',
        description: 'Classify image labels.',
        category: 'analysis',
        parameters: { type: 'object', properties: {} },
        isReadOnly: true,
        execute: async () => ({ success: true }),
      }),
    ).toBe(false);
  });

  it('requires planned EditOperations to remain traceable to a rationale', () => {
    const plan = createOperationPlan();

    expect(isOperationToolPlanTraceable(plan)).toBe(true);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it('registers domain adapters and finds the planner for an intent', async () => {
    const context: OperationToolAdapterContext = {
      rationale: {
        id: 'rat-1',
        decision: 'update-timeline-clip',
        reason: 'The selected clip should be renamed.',
        confidence: 'high',
        observationIds: ['obs-1'],
        evidenceIds: [],
        createdAt: 1,
      },
      contextPacketId: 'ctx-1',
    };
    const intent: OperationToolIntent = {
      id: 'intent-1',
      domain: 'timeline',
      summary: 'Rename selected timeline clip.',
      rationaleId: 'rat-1',
      targetIds: ['clip-3'],
      createdAt: 2,
    };
    const adapter: IOperationToolAdapter = {
      domain: 'timeline',
      canPlan: (candidate) => candidate.domain === 'timeline',
      plan: async (candidate) => ({
        ...createOperationPlan(),
        id: 'plan-1',
        intentId: candidate.id,
        rationaleId: candidate.rationaleId,
        createdAt: 3,
      }),
    };

    const registry = createOperationToolAdapterRegistry();
    registry.register(adapter);

    const planner = registry.findPlanner(intent, context);
    expect(planner).toBe(adapter);
    await expect(planner?.plan(intent, context)).resolves.toEqual(
      expect.objectContaining({ intentId: 'intent-1', rationaleId: 'rat-1' }),
    );

    registry.unregister('timeline');
    expect(registry.findPlanner(intent, context)).toBeUndefined();
  });

  it('maps operation domains to normalized creative domains', () => {
    expect(operationToolDomainMetadata('timeline')).toEqual({
      id: 'timeline',
      source: 'operation-tool',
      operationDomain: 'timeline',
      servicePortId: TIMELINE_RENDER_SERVICE_PORT_ID,
    });
    expect(operationToolDomainMetadata('audio')).toEqual({
      id: 'audio',
      source: 'operation-tool',
      operationDomain: 'audio',
      servicePortId: AUDIO_RENDER_SERVICE_PORT_ID,
    });
    expect(CREATIVE_DOMAIN_SERVICE_PORT_IDS.timeline).toBe(TIMELINE_RENDER_SERVICE_PORT_ID);
    expect(CREATIVE_DOMAIN_SERVICE_PORT_IDS.audio).toBe(AUDIO_RENDER_SERVICE_PORT_ID);
    expect(getOperationToolCreativeDomain(operationTool)).toEqual(
      expect.objectContaining({
        id: 'timeline',
        operationDomain: 'timeline',
      }),
    );
  });

  it('routes domain metadata to service port identity without runtime imports', () => {
    const router = createDomainRouter();
    const result = router.route(
      {
        id: 'intent-timeline-1',
        domain: operationToolDomainMetadata('timeline'),
      },
      [
        {
          id: 'timeline-tools',
          domain: { id: 'timeline', source: 'capability' },
          servicePortId: TIMELINE_RENDER_SERVICE_PORT_ID,
        },
      ],
    );

    expect(result).toEqual({
      ok: true,
      plan: {
        intentId: 'intent-timeline-1',
        domain: operationToolDomainMetadata('timeline'),
        servicePortId: TIMELINE_RENDER_SERVICE_PORT_ID,
        capabilityId: 'timeline-tools',
      },
    });
  });

  it('returns explainable domain route failures', () => {
    const router = createDomainRouter();
    const timelineCapability = {
      id: 'timeline-tools',
      domain: { id: 'timeline' as const, source: 'capability' as const },
      servicePortId: TIMELINE_RENDER_SERVICE_PORT_ID,
    };

    expect(router.route({ id: 'intent-missing-domain' }, [timelineCapability])).toEqual({
      ok: false,
      error: expect.objectContaining({
        reason: 'missing-intent-domain',
        intentId: 'intent-missing-domain',
      }),
    });
    expect(
      router.route(
        { id: 'intent-no-capabilities', domain: operationToolDomainMetadata('timeline') },
        [],
      ),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({
        reason: 'no-capabilities',
        intentId: 'intent-no-capabilities',
      }),
    });
    expect(
      router.route(
        {
          id: 'intent-filter-empty',
          domain: operationToolDomainMetadata('timeline'),
          capabilityIds: ['missing-capability'],
        },
        [timelineCapability],
      ),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({
        reason: 'capability-filter-empty',
        intentId: 'intent-filter-empty',
        capabilityIds: ['missing-capability'],
      }),
    });
    expect(
      router.route(
        {
          id: 'intent-domain-mismatch',
          domain: operationToolDomainMetadata('audio'),
        },
        [timelineCapability],
      ),
    ).toEqual({
      ok: false,
      error: expect.objectContaining({
        reason: 'domain-mismatch',
        intentId: 'intent-domain-mismatch',
        domain: operationToolDomainMetadata('audio'),
      }),
    });
  });

  it('keeps route failure results serializable', () => {
    const router = createDomainRouter();
    const result = router.route(
      {
        id: 'intent-timeline-1',
        domain: operationToolDomainMetadata('timeline'),
      },
      [],
    );

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe('no-capabilities');
    }
  });

  it('keeps route success results serializable', () => {
    const router = createDomainRouter();
    const result = router.route(
      {
        id: 'intent-timeline-1',
        domain: operationToolDomainMetadata('timeline'),
      },
      [
        {
          id: 'timeline-tools',
          domain: { id: 'timeline', source: 'capability' },
          servicePortId: TIMELINE_RENDER_SERVICE_PORT_ID,
        },
      ],
    );

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.servicePortId).toBe(TIMELINE_RENDER_SERVICE_PORT_ID);
    }
  });
});
