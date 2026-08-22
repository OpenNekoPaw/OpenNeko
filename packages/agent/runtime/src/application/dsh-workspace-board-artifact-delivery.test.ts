import { describe, expect, it, vi } from 'vitest';
import type { ContentLocator } from '@neko/content';
import type { DshAcpProjectedEvent } from '../acp/dsh-acp-projection';
import {
  collectDshWorkspaceBoardCompletedToolArtifacts,
  createDshWorkspaceBoardArtifactDeliveryService,
} from './dsh-workspace-board-artifact-delivery';

describe('DSH Workspace Board completed Tool artifact collection', () => {
  it('projects a stable parent document beside an exact content selector', () => {
    const source = {
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
      selector: { kind: 'entry' as const, path: 'OPS/chapter.xhtml' },
    };
    const collection = collect(documentTool('document-1', source));
    const parent = collection.batch?.artifacts.find(
      (artifact) => artifact.contentLocator.selector === undefined,
    );

    expect(collection.diagnostics).toEqual([]);
    expect(collection.batch).toMatchObject({ turn: 1, createdAt: 1_000 });
    expect(collection.batch?.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'file-reference',
          role: 'source',
          contentLocator: { file: source.file },
        }),
        expect.objectContaining({
          kind: 'file-reference',
          role: 'source',
          contentLocator: source,
          sourceArtifactIds: [parent?.artifactId],
        }),
      ]),
    );
  });
});

describe('DSH Workspace Board terminal Markdown delivery', () => {
  it('publishes one explicit document and delivers only its file reference', async () => {
    const publication = vi.fn(async (input) => ({
      contentLocator: input.contentLocator,
      contentFingerprint: input.contentFingerprint,
    }));
    const resolution = vi.fn(async (input) => ({
      contentLocator: input.contentLocator,
      contentFingerprint: input.contentFingerprint,
    }));
    const delivery = vi.fn(async () => ({ status: 'accepted' as const }));
    const service = createDshWorkspaceBoardArtifactDeliveryService({
      contexts: {
        readContext: async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        }),
      },
      publication: { publish: publication, resolve: resolution },
      delivery: { deliver: delivery },
      diagnostics: { report: vi.fn() },
    });

    await expect(
      service.deliverTerminal({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        turn: 1,
        events: terminalEvents(
          'Saved the durable plan.\n\n<!-- neko:artifact -->\n\n# Animation Plan\n\n## Scope\n\nReviewable content.',
        ),
        canvasTurnTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
      }),
    ).resolves.toEqual({ status: 'accepted' });

    expect(publication).toHaveBeenCalledOnce();
    expect(publication).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        markdown: '# Animation Plan\n\n## Scope\n\nReviewable content.',
        contentLocator: {
          file: {
            authority: 'workspace',
            path: expect.stringMatching(
              /^neko\/generated\/file\/animation-plan-[a-f0-9]{24}\.md$/u,
            ),
          },
        },
      }),
    );
    expect(delivery).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery: { kind: 'completed-turn' },
        artifacts: [
          expect.objectContaining({
            kind: 'file-reference',
            role: 'analysis',
            title: 'Animation Plan',
            mimeType: 'text/markdown',
          }),
        ],
      }),
    );
  });

  it('does not publish an ordinary final reply', async () => {
    const publication = vi.fn();
    const resolution = vi.fn();
    const delivery = vi.fn();
    const service = createDshWorkspaceBoardArtifactDeliveryService({
      contexts: {
        readContext: async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        }),
      },
      publication: { publish: publication, resolve: resolution },
      delivery: { deliver: delivery },
      diagnostics: { report: vi.fn() },
    });

    await expect(
      service.deliverTerminal({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        turn: 1,
        events: terminalEvents('This is an ordinary answer.'),
        canvasTurnTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
      }),
    ).resolves.toBeUndefined();
    expect(publication).not.toHaveBeenCalled();
    expect(delivery).not.toHaveBeenCalled();
  });

  it('rebuilds the reference from the final event only when the exact file still exists', async () => {
    const markdown =
      'Saved the durable plan.\n\n<!-- neko:artifact -->\n\n# Animation Plan\n\nReviewable content.';
    const events = terminalEvents(markdown);
    const resolution = vi.fn(async (input) => ({
      contentLocator: input.contentLocator,
      contentFingerprint: input.contentFingerprint,
    }));
    const service = createDshWorkspaceBoardArtifactDeliveryService({
      contexts: {
        readContext: async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        }),
      },
      publication: { publish: vi.fn(), resolve: resolution },
      delivery: { deliver: vi.fn() },
      diagnostics: { report: vi.fn() },
    });

    await expect(
      service.resolveTerminalArtifact({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        messageId: 'assistant-1',
        events,
      }),
    ).resolves.toMatchObject({
      messageId: 'assistant-1',
      title: 'Animation Plan',
      contentLocator: {
        file: {
          authority: 'workspace',
          path: expect.stringMatching(/^neko\/generated\/file\/animation-plan-[a-f0-9]{24}\.md$/u),
        },
      },
    });
    expect(resolution).toHaveBeenCalledOnce();

    resolution.mockResolvedValueOnce(undefined);
    await expect(
      service.resolveTerminalArtifact({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        messageId: 'assistant-1',
        events,
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects malformed admitted Markdown before publication', async () => {
    const publication = vi.fn();
    const delivery = vi.fn();
    const service = createWorkspaceTerminalDeliveryService(publication, delivery);

    await expect(
      service.deliverTerminal({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        turn: 1,
        events: terminalEvents('Summary\n\n<!-- neko:artifact -->\n\n## Missing H1'),
        canvasTurnTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
      }),
    ).rejects.toThrow(/must begin with one H1 title/u);
    expect(publication).not.toHaveBeenCalled();
    expect(delivery).not.toHaveBeenCalled();
  });

  it('requires the exact Canvas target before publishing a document', async () => {
    const publication = vi.fn();
    const delivery = vi.fn();
    const service = createWorkspaceTerminalDeliveryService(publication, delivery);

    await expect(
      service.deliverTerminal({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        turn: 1,
        events: terminalEvents('Summary\n\n<!-- neko:artifact -->\n\n# Durable Plan'),
      }),
    ).rejects.toThrow(/no admitted Canvas target/u);
    expect(publication).not.toHaveBeenCalled();
    expect(delivery).not.toHaveBeenCalled();
  });

  it('does not publish an interrupted turn', async () => {
    const publication = vi.fn();
    const delivery = vi.fn();
    const service = createWorkspaceTerminalDeliveryService(publication, delivery);

    await expect(
      service.deliverTerminal({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        turn: 1,
        events: terminalEvents(
          'Summary\n\n<!-- neko:artifact -->\n\n# Incomplete Plan',
          'interrupted',
        ),
        canvasTurnTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
      }),
    ).resolves.toBeUndefined();
    expect(publication).not.toHaveBeenCalled();
    expect(delivery).not.toHaveBeenCalled();
  });
});

function createWorkspaceTerminalDeliveryService(
  publication: ReturnType<typeof vi.fn>,
  delivery: ReturnType<typeof vi.fn>,
) {
  return createDshWorkspaceBoardArtifactDeliveryService({
    contexts: {
      readContext: async () => ({
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
      }),
    },
    publication: { publish: publication, resolve: vi.fn() },
    delivery: { deliver: delivery },
    diagnostics: { report: vi.fn() },
  });
}

function collect(event: DshAcpProjectedEvent) {
  return collectDshWorkspaceBoardCompletedToolArtifacts({
    events: [event],
    toolCallId: event.kind === 'tool' ? event.toolCallId : 'missing',
  });
}

function documentTool(toolCallId: string, source: ContentLocator): DshAcpProjectedEvent {
  return {
    kind: 'tool',
    sessionId: 'dsh-1',
    toolCallId,
    turn: 1,
    turnStartedAt: 1_000,
    status: 'completed',
    title: 'openneko.document',
    rawInput: { operation: 'read', source },
    rawOutput: [{ type: 'text', text: JSON.stringify({ status: 'ready', source }) }],
  };
}

function terminalEvents(markdown: string, reason = 'end_turn'): readonly DshAcpProjectedEvent[] {
  return [
    {
      kind: 'message',
      sessionId: 'dsh-1',
      role: 'assistant',
      turn: 1,
      step: 1,
      text: markdown,
      messageId: 'assistant-1',
      state: 'final',
    },
    {
      kind: 'turn',
      sessionId: 'dsh-1',
      turn: 1,
      phase: 'end',
      startedAt: 1_000,
      completedAt: 2_000,
      reason,
    },
  ];
}
