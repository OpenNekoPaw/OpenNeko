import { describe, expect, it } from 'vitest';
import type { DshAcpProjectedEvent } from '../acp/dsh-acp-projection';
import {
  collectDshWorkspaceBoardArtifactBatch,
  createDshWorkspaceBoardTerminalDeliveryService,
  type DshWorkspaceBoardArtifactDeliveryInput,
} from './dsh-workspace-board-artifact-delivery';

describe('DSH Workspace Board artifact collection', () => {
  it('commits one source-analysis batch only after successful turn completion', () => {
    const events: DshAcpProjectedEvent[] = [
      turnStart(),
      documentTool('document-1'),
      imageTool('image-1'),
      assistant('# BLAME! 前 10 页分析\n\n分析内容。'),
    ];
    expect(collectDshWorkspaceBoardArtifactBatch({ events, turn: 1 })).toBeUndefined();

    events.push(turnEnd());
    expect(collectDshWorkspaceBoardArtifactBatch({ events, turn: 1 })).toMatchObject({
      turn: 1,
      completedAt: 2_000,
      artifacts: [
        {
          kind: 'image',
          role: 'source',
          title: 'page-1.jpg',
          contentLocator: {
            file: { authority: 'workspace', path: 'books/blame.epub' },
            selector: { kind: 'entry', path: 'images/page-1.jpg' },
          },
        },
        {
          kind: 'file-reference',
          role: 'source',
          title: 'blame.epub',
          contentLocator: { file: { authority: 'workspace', path: 'books/blame.epub' } },
        },
        {
          kind: 'markdown',
          role: 'analysis',
          title: 'BLAME! 前 10 页分析',
          sourceArtifactIds: expect.arrayContaining([
            expect.stringMatching(/^content:/u),
            expect.stringMatching(/^content:/u),
          ]),
        },
      ],
    });
  });

  it('deduplicates repeated locators and produces stable identities across replay', () => {
    const events = [
      turnStart(),
      documentTool('a'),
      documentTool('b'),
      assistant('Analysis'),
      turnEnd(),
    ];
    const first = collectDshWorkspaceBoardArtifactBatch({ events, turn: 1 });
    const replay = collectDshWorkspaceBoardArtifactBatch({ events: [...events], turn: 1 });

    expect(first).toEqual(replay);
    expect(first?.artifacts.filter((artifact) => artifact.role === 'source')).toHaveLength(1);
    expect(first?.artifacts[0]?.contentFingerprint).toMatch(/^locator:/u);
  });

  it.each(['interrupted', 'max-tokens', 'failed', 'error', 'cancelled'])(
    'does not deliver a %s turn',
    (reason) => {
      const events = [turnStart(), documentTool('a'), assistant('Analysis'), turnEnd(reason)];
      expect(collectDshWorkspaceBoardArtifactBatch({ events, turn: 1 })).toBeUndefined();
    },
  );

  it('does not promote ordinary text, source-only reads, or failed Tools', () => {
    expect(
      collectDshWorkspaceBoardArtifactBatch({
        events: [turnStart(), assistant('Hello'), turnEnd()],
        turn: 1,
      }),
    ).toBeUndefined();
    expect(
      collectDshWorkspaceBoardArtifactBatch({
        events: [turnStart(), documentTool('a'), turnEnd()],
        turn: 1,
      }),
    ).toBeUndefined();
    expect(
      collectDshWorkspaceBoardArtifactBatch({
        events: [
          turnStart(),
          documentTool('ok'),
          { ...imageTool('failed'), status: 'failed' },
          assistant('Analysis'),
          turnEnd(),
        ],
        turn: 1,
      }),
    ).toBeUndefined();
  });
});

describe('DSH Workspace Board terminal delivery service', () => {
  it('targets the exact authoritative Workspace after the terminal projection', async () => {
    const deliveries: DshWorkspaceBoardArtifactDeliveryInput[] = [];
    const service = createDshWorkspaceBoardTerminalDeliveryService({
      contexts: {
        readContext: async () => ({
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        }),
      },
      delivery: {
        deliver: async (input) => {
          deliveries.push(input);
          return { status: 'accepted' };
        },
      },
    });

    const outcome = await service.deliverTerminal({
      conversationId: 'conversation-1',
      dshSessionId: 'dsh-1',
      events: [turnStart(), documentTool('a'), assistant('Analysis'), turnEnd()],
    });

    expect(outcome).toEqual({ status: 'accepted' });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      dshSessionId: 'dsh-1',
      turn: 1,
    });
  });

  it('does not infer a Workspace for a non-Workspace Conversation', async () => {
    let deliveryCount = 0;
    const service = createDshWorkspaceBoardTerminalDeliveryService({
      contexts: {
        readContext: async () => ({
          kind: 'assistant',
          assistantSpaceId: 'assistant-1',
          baseGrantIds: [],
        }),
      },
      delivery: {
        deliver: async () => {
          deliveryCount += 1;
          return { status: 'accepted' };
        },
      },
    });

    await expect(
      service.deliverTerminal({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        events: [turnStart(), documentTool('a'), assistant('Analysis'), turnEnd()],
      }),
    ).resolves.toBeUndefined();
    expect(deliveryCount).toBe(0);
  });
});

function turnStart(): DshAcpProjectedEvent {
  return { kind: 'turn', sessionId: 'dsh-1', turn: 1, phase: 'start', startedAt: 1_000 };
}

function turnEnd(reason = 'stop'): DshAcpProjectedEvent {
  return {
    kind: 'turn',
    sessionId: 'dsh-1',
    turn: 1,
    phase: 'end',
    startedAt: 1_000,
    completedAt: 2_000,
    reason,
  };
}

function assistant(text: string): DshAcpProjectedEvent {
  return {
    kind: 'message',
    sessionId: 'dsh-1',
    role: 'assistant',
    turn: 1,
    step: 2,
    text,
    messageId: 'assistant-1',
    state: 'final',
  };
}

function documentTool(toolCallId: string): DshAcpProjectedEvent {
  return {
    kind: 'tool',
    sessionId: 'dsh-1',
    toolCallId,
    turn: 1,
    status: 'completed',
    title: 'openneko.document',
    rawInput: {
      operation: 'read',
      input: {
        source: { file: { authority: 'workspace', path: 'books/blame.epub' } },
        mode: 'content',
      },
    },
  };
}

function imageTool(toolCallId: string): DshAcpProjectedEvent {
  return {
    kind: 'tool',
    sessionId: 'dsh-1',
    toolCallId,
    turn: 1,
    status: 'completed',
    title: 'openneko.read_image',
    rawInput: {
      source: {
        file: { authority: 'workspace', path: 'books/blame.epub' },
        selector: { kind: 'entry', path: 'images/page-1.jpg' },
      },
    },
  };
}
