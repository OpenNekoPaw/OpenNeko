import { DEFAULT_EXTERNAL_RESEARCH_CONFIG } from '@neko/agent-contracts';
import { createEffectiveAgentConfigurationProjection } from '@neko/host/settings';
import { describe, expect, it } from 'vitest';
import type { PiProductAgentEvent, PiProductEventPayload, PiToolRunIdentity } from '../../pi';
import {
  assertCompleteDesktopAgentNeutralFacts,
  type DesktopAgentFactsTurnResult,
} from './desktop-agent-facts';
import {
  createDesktopAgentFactsProjector,
  createDesktopAgentFactsStore,
} from './desktop-agent-facts-projector';

const identity: PiToolRunIdentity = {
  workspaceId: 'workspace-1',
  conversationId: 'conversation-1',
  branchId: 'branch-1',
  turnId: 'turn-1',
  runId: 'run-1',
};

describe('Desktop Agent authoritative facts projector', () => {
  it('projects event, owner, configuration and resource-display facts for the exact turn', () => {
    const projector = createProjector();
    const events = projector.beginTurn({ identity, systemPrompt: 'Desktop Agent system prompt' });
    events.emit(
      event({ type: 'tool.started', toolCallId: 'read-image-1', toolName: 'ReadImage', args: {} }),
    );
    events.emit(
      event({
        type: 'confirmation.resolved',
        confirmationId: 'confirmation:read-image-1',
        toolCallId: 'read-image-1',
        toolName: 'ReadImage',
        approved: true,
      }),
    );
    events.emit(
      event({
        type: 'tool.completed',
        toolCallId: 'read-image-1',
        toolName: 'ReadImage',
        result: {},
        isError: false,
      }),
    );
    events.emit(
      event({
        type: 'skill.activated',
        skillName: 'character-creator',
        source: 'builtin',
        fingerprint: 'sha256:character-creator-fixture',
      }),
    );
    events.emit(
      event({
        type: 'usage',
        provider: 'provider-1',
        model: 'model-1',
        usage: {
          input: 10,
          output: 4,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 14,
          cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
        },
      }),
    );
    projector.recordResourceDisplayProjection({
      conversationId: identity.conversationId,
      toolCallId: 'read-image-1',
      projectionKind: 'tool-result',
      status: 'authorized',
      sourceKind: 'workspace-file',
      transport: 'openneko-resource',
      renderTarget: 'agent-webview',
      diagnosticCodes: [],
    });
    projector.completeTurn({ conversation: conversationEvidence(), turn: turnResult() });

    expect(projector.readFacts(identity)).toMatchObject({
      receipts: {
        skills: {
          items: [
            {
              name: 'character-creator',
              source: 'builtin',
              fingerprint: 'sha256:character-creator-fixture',
              status: 'injected',
            },
          ],
        },
        tools: { items: [{ name: 'ReadImage', callId: 'read-image-1', status: 'success' }] },
        permissions: { items: [{ toolCallId: 'read-image-1', decision: 'approved' }] },
      },
      resourceDisplayProjections: {
        items: [
          {
            toolCallId: 'read-image-1',
            status: 'authorized',
            transport: 'openneko-resource',
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 4, costUsd: 0.3 },
      disposal: { status: 'pending' },
    });

    projector.dispose();
    expect(assertCompleteDesktopAgentNeutralFacts(projector.readFacts(identity))).toMatchObject({
      disposal: { status: 'disposed' },
    });
  });

  it('fails visibly for missing terminal facts and mismatched event identities', () => {
    const projector = createProjector();
    const events = projector.beginTurn({ identity, systemPrompt: 'prompt' });
    expect(projector.readLatestIdentity(identity.conversationId)).toBeUndefined();
    expect(() => projector.readFacts(identity)).toThrow('before terminal completion');
    expect(() =>
      events.emit(event({ type: 'turn.started' }, { ...identity, runId: 'run-stale' })),
    ).toThrow('event identity does not match');
    expect(() => projector.readFacts({ ...identity, turnId: 'turn-missing' })).toThrow(
      'do not own turn',
    );

    projector.completeTurn({ conversation: conversationEvidence(), turn: turnResult() });
    expect(projector.readLatestIdentity(identity.conversationId)).toEqual(identity);
  });

  it('hands initial Turn facts to the exact Session connection without copying facts', () => {
    const store = createDesktopAgentFactsStore();
    const writer = createDesktopAgentFactsProjector({
      connection: connection('initial-turn'),
      store,
    });
    writer.beginTurn({ identity, systemPrompt: 'prompt' });
    writer.completeTurn({ conversation: conversationEvidence(), turn: turnResult() });

    const reader = createDesktopAgentFactsProjector({
      connection: connection('session-connection'),
      store,
    });
    expect(reader.readLatestIdentity(identity.conversationId)).toEqual(identity);
    expect(reader.readFacts(identity)).toMatchObject({
      identity: { connection: { connectionId: 'session-connection' } },
      disposal: { status: 'pending' },
    });

    reader.dispose();
    expect(reader.readFacts(identity)).toMatchObject({ disposal: { status: 'disposed' } });
    expect(writer.readFacts(identity)).toMatchObject({ disposal: { status: 'pending' } });
  });

  it('records a blocked Workspace Board delivery without changing the terminal Turn state', () => {
    const projector = createProjector();
    projector.beginTurn({ identity, systemPrompt: 'prompt' });
    projector.completeTurn({
      conversation: conversationEvidence(),
      turn: {
        ...turnResult(),
        artifactDelivery: {
          status: 'blocked',
          diagnostic: {
            code: 'projection-write-failed',
            message: 'Host-only detail.',
          },
        },
      },
    });

    expect(projector.readFacts(identity)).toMatchObject({
      projection: { terminalState: 'completed' },
      diagnostics: {
        items: [
          {
            code: 'projection-write-failed',
            severity: 'error',
            message: 'Workspace Board delivery was blocked; durable artifacts were retained.',
          },
        ],
      },
    });
  });

  it('preserves dropped-count failure when an authoritative collection is truncated', () => {
    const projector = createProjector(1);
    const events = projector.beginTurn({ identity, systemPrompt: 'prompt' });
    for (const callId of ['tool-1', 'tool-2']) {
      events.emit(event({ type: 'tool.started', toolCallId: callId, toolName: 'Read', args: {} }));
      events.emit(
        event({
          type: 'tool.completed',
          toolCallId: callId,
          toolName: 'Read',
          result: {},
          isError: false,
        }),
      );
    }
    projector.completeTurn({ conversation: conversationEvidence(), turn: turnResult() });
    projector.dispose();

    const facts = projector.readFacts(identity);
    expect(facts.receipts.tools.droppedCount).toBe(1);
    expect(() => assertCompleteDesktopAgentNeutralFacts(facts)).toThrow(
      'tools facts were truncated',
    );
  });
});

function createProjector(factLimit?: number) {
  return createDesktopAgentFactsProjector({
    connection: connection('connection-1'),
    ...(factLimit === undefined ? {} : { factLimit }),
  });
}

function connection(connectionId: string) {
  return {
    applicationInstanceId: 'application-1',
    windowId: 'window-1',
    workbenchInstanceId: 'workbench-1',
    agentSurfaceId: 'agent-surface-1',
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
    connectionId,
  };
}

function event(
  payload: PiProductEventPayload,
  eventIdentity: PiToolRunIdentity = identity,
): PiProductAgentEvent {
  return Object.freeze({ ...payload, identity: eventIdentity, timestamp: 1 });
}

function conversationEvidence() {
  return {
    workspaceId: identity.workspaceId,
    conversationId: identity.conversationId,
    branchId: identity.branchId,
    piSessionId: 'pi-session-1',
    writerLeaseId: 'writer-lease-1',
  };
}

function turnResult(): DesktopAgentFactsTurnResult {
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
  return {
    identity,
    durability: 'durable',
    projection: {
      conversationId: identity.conversationId,
      turns: [
        {
          turnId: identity.turnId,
          runId: identity.runId,
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
}
