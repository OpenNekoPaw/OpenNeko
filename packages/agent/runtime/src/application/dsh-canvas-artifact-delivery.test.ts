import { describe, expect, it, vi } from 'vitest';
import type { ContentLocator } from '@neko/content-domain';
import type { DshAcpProjectedEvent } from '../acp/dsh-acp-projection';
import {
  collectDshCanvasArtifactCompletedToolArtifacts,
  createDshCanvasArtifactDeliveryService,
} from './dsh-canvas-artifact-delivery';

describe('DSH Canvas completed Tool artifact collection', () => {
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

  it('projects the validated document input when model-facing output is truncated text', () => {
    const source = {
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
      selector: { kind: 'entry' as const, path: 'OPS/chapter.xhtml' },
    };
    const event = documentTool('document-truncated', source);
    const collection = collect({
      ...event,
      rawOutput: [{ type: 'text', text: '{"source":{"file": [truncated]' }],
    });

    expect(collection.diagnostics).toEqual([]);
    expect(collection.batch?.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contentLocator: { file: source.file } }),
        expect.objectContaining({ contentLocator: source }),
      ]),
    );
  });

  it('projects every original source from an image overview without persisting the contact sheet', () => {
    const sources = [imageLocator('image/page-1.jpg'), imageLocator('image/page-2.jpg')];
    const collection = collect(imageOverviewTool('overview-1', sources));
    const parent = collection.batch?.artifacts.find(
      (artifact) => artifact.contentLocator.selector === undefined,
    );

    expect(collection.diagnostics).toEqual([]);
    expect(collection.batch).toMatchObject({ turn: 1, createdAt: 1_000 });
    expect(collection.batch?.artifacts).toEqual([
      expect.objectContaining({
        kind: 'file-reference',
        title: 'blame.epub',
        contentLocator: { file: sources[0]!.file },
      }),
      expect.objectContaining({
        kind: 'image',
        title: 'page-1.jpg',
        sourceArtifactIds: [parent?.artifactId],
        contentLocator: sources[0],
      }),
      expect.objectContaining({
        kind: 'image',
        title: 'page-2.jpg',
        sourceArtifactIds: [parent?.artifactId],
        contentLocator: sources[1],
      }),
    ]);
  });

  it('delivers an image overview as soon as its Tool event completes', async () => {
    const publication = vi.fn();
    const delivery = vi.fn(async () => ({ status: 'accepted' as const }));
    const service = createDshCanvasArtifactDeliveryService({
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
    const event = imageOverviewTool('overview-1', [
      imageLocator('image/page-1.jpg'),
      imageLocator('image/page-2.jpg'),
    ]);

    await expect(
      service.deliverCompletedTool({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        toolCallId: 'overview-1',
        events: [event],
        canvasTurnTarget: {
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/workspace.nkc',
        },
      }),
    ).resolves.toEqual({ status: 'accepted' });

    expect(publication).not.toHaveBeenCalled();
    expect(delivery).toHaveBeenCalledWith(
      expect.objectContaining({
        turn: 1,
        createdAt: 1_000,
        delivery: { kind: 'completed-tool', toolCallId: 'overview-1' },
        artifacts: [
          expect.objectContaining({ kind: 'file-reference', title: 'blame.epub' }),
          expect.objectContaining({ kind: 'image', title: 'page-1.jpg' }),
          expect.objectContaining({ kind: 'image', title: 'page-2.jpg' }),
        ],
      }),
    );
  });

  it('reports malformed image overview sources without writing a partial Canvas record', async () => {
    const delivery = vi.fn();
    const report = vi.fn();
    const service = createDshCanvasArtifactDeliveryService({
      contexts: {
        readContext: async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        }),
      },
      publication: { publish: vi.fn(), resolve: vi.fn() },
      delivery: { deliver: delivery },
      diagnostics: { report },
    });
    const event = {
      ...imageOverviewTool('overview-invalid', [imageLocator('image/page-1.jpg')]),
      rawInput: { sources: [{ invalid: true }] },
    };

    await expect(
      service.deliverCompletedTool({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        toolCallId: 'overview-invalid',
        events: [event],
        canvasTurnTarget: {
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/workspace.nkc',
        },
      }),
    ).resolves.toBeUndefined();

    expect(delivery).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'DSH_CANVAS_ARTIFACT_CONTENT_TOOL_PROJECTION_INVALID',
        toolCallId: 'overview-invalid',
        toolName: 'openneko_read_images',
      }),
    );
  });
});

describe('DSH Canvas terminal Markdown delivery', () => {
  it('publishes one explicit document and delivers only its file reference', async () => {
    const publication = vi.fn(async (input) => ({
      contentLocator: input.contentLocator,
      contentFingerprint: input.contentFingerprint,
    }));
    const resolution = vi.fn(async (input) => ({
      contentLocator: input.contentLocator,
    }));
    const delivery = vi.fn(async () => ({ status: 'accepted' as const }));
    const service = createDshCanvasArtifactDeliveryService({
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
          'Saved the durable plan.\n\n<!-- neko:next-action -->\n\nGenerate the opening shot.\n\n<!-- neko:artifact -->\n\n# Animation Plan\n\n## Scope\n\nReviewable content.',
        ),
        canvasTurnTarget: {
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/workspace.nkc',
        },
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
    const service = createDshCanvasArtifactDeliveryService({
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
        canvasTurnTarget: {
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/workspace.nkc',
        },
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
    }));
    const service = createDshCanvasArtifactDeliveryService({
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
    expect(resolution).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      contentLocator: expect.objectContaining({
        file: expect.objectContaining({ authority: 'workspace' }),
      }),
    });

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

  it('rejects a resolver that substitutes another Workspace file', async () => {
    const service = createDshCanvasArtifactDeliveryService({
      contexts: {
        readContext: async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        }),
      },
      publication: {
        publish: vi.fn(),
        resolve: vi.fn(async () => ({
          contentLocator: {
            file: { authority: 'workspace' as const, path: 'neko/generated/file/another.md' },
          },
        })),
      },
      delivery: { deliver: vi.fn() },
      diagnostics: { report: vi.fn() },
    });

    await expect(
      service.resolveTerminalArtifact({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        messageId: 'assistant-1',
        events: terminalEvents(
          'Saved the durable plan.\n\n<!-- neko:artifact -->\n\n# Animation Plan\n\nReviewable content.',
        ),
      }),
    ).rejects.toThrow('resolution returned another ContentLocator');
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
        canvasTurnTarget: {
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/workspace.nkc',
        },
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
        canvasTurnTarget: {
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/workspace.nkc',
        },
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
  return createDshCanvasArtifactDeliveryService({
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
  return collectDshCanvasArtifactCompletedToolArtifacts({
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
    title: 'openneko_document',
    rawInput: { operation: 'read', source },
    rawOutput: [{ type: 'text', text: JSON.stringify({ status: 'ready', source }) }],
  };
}

function imageOverviewTool(
  toolCallId: string,
  sources: readonly ContentLocator[],
): DshAcpProjectedEvent {
  return {
    kind: 'tool',
    sessionId: 'dsh-1',
    toolCallId,
    turn: 1,
    turnStartedAt: 1_000,
    status: 'completed',
    title: 'openneko_read_images',
    rawInput: { sources },
    rawOutput: [
      { type: 'text', text: 'image overview' },
      {
        type: 'image',
        attachment: { attachmentId: 'contact-sheet', mediaType: 'image/jpeg' },
      },
    ],
  };
}

function imageLocator(entryPath: string): ContentLocator {
  return {
    file: { authority: 'workspace', path: 'books/blame.epub' },
    selector: { kind: 'entry', path: entryPath },
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
