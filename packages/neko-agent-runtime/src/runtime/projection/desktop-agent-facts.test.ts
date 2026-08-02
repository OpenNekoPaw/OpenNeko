import { DEFAULT_EXTERNAL_RESEARCH_CONFIG } from '@neko-agent/contracts';
import { createEffectiveAgentConfigurationProjection } from '@neko/host/settings';
import { describe, expect, it } from 'vitest';
import type { DesktopAgentConnectionIdentity } from '@neko-agent/contracts';
import { parseDesktopAgentNeutralFacts } from '@neko-agent/contracts';
import {
  assertCompleteDesktopAgentNeutralFacts,
  createDesktopAgentNeutralFacts,
  type CreateDesktopAgentNeutralFactsInput,
  type DesktopAgentConversationEvidence,
  type DesktopAgentFactsTurnResult,
} from './desktop-agent-facts';

const DIGEST = `sha256:${'a'.repeat(64)}` as const;

describe('Desktop Agent neutral facts', () => {
  it('projects authoritative identities, configuration and terminal lifecycle evidence', () => {
    const facts = createDesktopAgentNeutralFacts(input());

    expect(assertCompleteDesktopAgentNeutralFacts(facts)).toBe(facts);
    expect(facts).toMatchObject({
      schemaVersion: 1,
      identity: {
        conversationId: 'conversation-1',
        piSessionId: 'pi-session-1',
        turnId: 'turn-1',
        runId: 'run-1',
      },
      runtimePath: {
        controller: 'sender-bound-desktop-agent-controller',
        runtime: 'pi-conversation-runtime',
        forbiddenPathCount: 0,
      },
      projection: { revision: 2, terminalState: 'completed' },
      resourceDisplayProjections: {
        droppedCount: 0,
        items: [
          {
            projectionKind: 'tool-result',
            status: 'authorized',
            locatorKind: 'workspace-file',
            transport: 'openneko-resource',
            renderTarget: 'agent-webview',
          },
        ],
      },
      persistence: { durability: 'durable', checkpoint: 'observed' },
      disposal: { status: 'disposed' },
    });
    expect(JSON.stringify(facts)).not.toMatch(/suite|variant|baseline|score/iu);
    expect(parseDesktopAgentNeutralFacts(structuredClone(facts))).toEqual(facts);
  });

  it('fails visibly for mismatched owner identity and non-terminal evidence', () => {
    const mismatched = input();
    mismatched.conversation = { ...mismatched.conversation, workspaceId: 'workspace-other' };
    expect(() => createDesktopAgentNeutralFacts(mismatched)).toThrow(
      'Workspace identity does not match',
    );

    const missingCompletion = input();
    missingCompletion.turn = {
      ...missingCompletion.turn,
      projection: { ...missingCompletion.turn.projection, turns: [] },
    };
    expect(() => createDesktopAgentNeutralFacts(missingCompletion)).toThrow(
      'no matching terminal completion',
    );
  });

  it('reports bounded truncation and incomplete disposal instead of accepting weak facts', () => {
    const truncatedInput = input();
    truncatedInput.factLimit = 1;
    truncatedInput.toolReceipts = [
      { name: 'Read', status: 'success' },
      { name: 'Write', status: 'success' },
    ];
    const truncated = createDesktopAgentNeutralFacts(truncatedInput);
    expect(truncated.receipts.tools.droppedCount).toBe(1);
    expect(() => assertCompleteDesktopAgentNeutralFacts(truncated)).toThrow(
      'tools facts were truncated',
    );

    const pending = createDesktopAgentNeutralFacts({ ...input(), disposal: { status: 'pending' } });
    expect(() => assertCompleteDesktopAgentNeutralFacts(pending)).toThrow(
      'disposal is not complete',
    );
  });

  it('rejects secrets, absolute user paths and drifted configuration digests', () => {
    const expandedInput = Object.assign(input(), {
      host: { raw: true },
      arbitraryHandle: { close: () => undefined },
    });
    const projected = createDesktopAgentNeutralFacts(expandedInput);
    expect(projected).not.toHaveProperty('host');
    expect(projected).not.toHaveProperty('arbitraryHandle');

    expect(() =>
      createDesktopAgentNeutralFacts({
        ...input(),
        diagnostics: [{ code: 'provider', severity: 'error', message: 'api_key exposed' }],
      }),
    ).toThrow('credential-shaped');
    expect(() =>
      createDesktopAgentNeutralFacts({
        ...input(),
        diagnostics: [
          { code: 'provider', severity: 'error', message: '/Users/private/project/config.toml' },
        ],
      }),
    ).toThrow('absolute filesystem path');
    expect(() =>
      createDesktopAgentNeutralFacts({
        ...input(),
        toolReceipts: [{ name: 'baseline', status: 'catalogued' }],
      }),
    ).toThrow('Evaluation outcome concepts');

    const drifted = input();
    drifted.turn = {
      ...drifted.turn,
      configuration: {
        ...drifted.turn.configuration,
        effective: {
          ...drifted.turn.configuration.effective,
          values: { ...drifted.turn.configuration.effective.values, maxTokens: 1 },
        },
      },
    };
    expect(() => createDesktopAgentNeutralFacts(drifted)).toThrow('digest does not match');
  });

  it('keeps the preload facts parser strict without importing host-only digest code', () => {
    const facts = structuredClone(createDesktopAgentNeutralFacts(input()));
    expect(() =>
      parseDesktopAgentNeutralFacts({
        ...facts,
        configuration: {
          ...facts.configuration,
          effective: {
            ...facts.configuration.effective,
            profileId: 'effective-agent-0000000000000000',
          },
        },
      }),
    ).toThrow('configuration profile identity is invalid');

    const dimensions = structuredClone(createDesktopAgentNeutralFacts(input()));
    expect(() =>
      parseDesktopAgentNeutralFacts({
        ...dimensions,
        configuration: {
          ...dimensions.configuration,
          effective: {
            ...dimensions.configuration.effective,
            dimensions: [...dimensions.configuration.effective.dimensions].reverse(),
          },
        },
      }),
    ).toThrow('configuration dimension is invalid');
  });
});

function input(): MutableFactsInput {
  const configuration = createEffectiveAgentConfigurationProjection({
    providerId: 'provider-1',
    modelId: 'model-1',
    temperature: 0.7,
    maxTokens: 2_048,
    thinkingBudget: 0,
    executionMode: 'ask',
    outputFormat: 'markdown',
    defaultMediaModels: {},
    externalResearch: DEFAULT_EXTERNAL_RESEARCH_CONFIG,
    mcpServers: [],
    diagnostics: [],
    sources: {
      provider: 'runtime',
      model: 'runtime',
      temperature: 'default',
      maxTokens: 'default',
      thinkingBudget: 'default',
      executionMode: 'default',
      outputFormat: 'default',
      mediaDefaults: {},
    },
  });
  const connection: DesktopAgentConnectionIdentity = {
    applicationInstanceId: 'application-1',
    windowId: 'window-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
    viewEpoch: 1,
    rendererEpoch: 1,
    connectionId: 'connection-1',
  };
  const conversation: DesktopAgentConversationEvidence = {
    workspaceId: 'workspace-1',
    conversationId: 'conversation-1',
    branchId: 'branch-1',
    piSessionId: 'pi-session-1',
    writerEpoch: 1,
  };
  const turn: DesktopAgentFactsTurnResult = {
    identity: {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      branchId: 'branch-1',
      turnId: 'turn-1',
      runId: 'run-1',
    },
    durability: 'durable',
    projection: {
      conversationId: 'conversation-1',
      projectionVersion: 2,
      turns: [
        {
          turnId: 'turn-1',
          runId: 'run-1',
          messageId: 'message-1',
          items: [],
          completion: { status: 'completed', completedAt: 1 },
        },
      ],
    },
    configuration: { requested: configuration, effective: configuration, diagnostics: [] },
    path: {
      runtime: 'pi-conversation-runtime',
      transcript: 'pi-session',
      metadata: 'sqlite',
      projection: 'conversation-projection-store',
    },
  };
  return {
    connection,
    conversation,
    turn,
    promptReceipts: [{ id: 'system', source: 'system', digest: DIGEST }],
    skillReceipts: [
      { name: 'storyboard', source: 'builtin', fingerprint: DIGEST, status: 'injected' },
    ],
    toolReceipts: [{ name: 'Read', status: 'success' }],
    permissionReceipts: [{ toolCallId: 'tool-call-1', decision: 'approved' }],
    resourceDisplayProjections: [
      {
        conversationId: 'conversation-1',
        toolCallId: 'tool-call-1',
        projectionKind: 'tool-result',
        status: 'authorized',
        locatorKind: 'workspace-file',
        transport: 'openneko-resource',
        renderTarget: 'agent-webview',
        diagnosticCodes: [],
      },
    ],
    usage: { inputTokens: 10, outputTokens: 4 },
    diagnostics: [],
    disposal: { status: 'disposed' },
  };
}

interface MutableFactsInput extends CreateDesktopAgentNeutralFactsInput {
  connection: DesktopAgentConnectionIdentity;
  conversation: DesktopAgentConversationEvidence;
  turn: DesktopAgentFactsTurnResult;
  promptReceipts: CreateDesktopAgentNeutralFactsInput['promptReceipts'];
  skillReceipts: CreateDesktopAgentNeutralFactsInput['skillReceipts'];
  toolReceipts: CreateDesktopAgentNeutralFactsInput['toolReceipts'];
  permissionReceipts: CreateDesktopAgentNeutralFactsInput['permissionReceipts'];
  diagnostics: NonNullable<CreateDesktopAgentNeutralFactsInput['diagnostics']>;
  disposal: CreateDesktopAgentNeutralFactsInput['disposal'];
  factLimit?: number;
}
