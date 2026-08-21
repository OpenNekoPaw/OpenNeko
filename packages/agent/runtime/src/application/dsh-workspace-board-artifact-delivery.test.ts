import { describe, expect, it } from 'vitest';
import type { DshAcpProjectedEvent } from '../acp/dsh-acp-projection';
import {
  collectDshWorkspaceBoardCompletedToolArtifacts,
  collectDshWorkspaceBoardArtifacts,
  createDshWorkspaceBoardArtifactDeliveryService,
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
    expect(collectBatch(events)).toBeUndefined();

    events.push(turnEnd());
    const batch = collectBatch(events);
    expect(batch).toMatchObject({ turn: 1, createdAt: 2_000 });
    expect(batch?.artifacts.filter((artifact) => artifact.role === 'source')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'file-reference',
          role: 'source',
          title: 'blame.epub',
          contentLocator: { file: { authority: 'workspace', path: 'books/blame.epub' } },
        }),
        expect.objectContaining({ kind: 'image', role: 'source', title: 'page-1.jpg' }),
      ]),
    );
    expect(batch?.artifacts.at(-1)).toMatchObject({
      kind: 'markdown',
      role: 'analysis',
      title: 'BLAME! 前 10 页分析',
      sourceArtifactIds: [expect.stringMatching(/^content:/u), expect.stringMatching(/^content:/u)],
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
    const first = collectBatch(events);
    const replay = collectBatch([...events]);

    expect(first).toEqual(replay);
    expect(first?.artifacts.filter((artifact) => artifact.role === 'source')).toHaveLength(1);
    expect(first?.artifacts[0]?.contentFingerprint).toMatch(/^locator:/u);
  });

  it('deduplicates exact locators while retaining distinct selectors in one container', () => {
    const firstPage = {
      file: { authority: 'workspace' as const, path: 'books/blame.pdf' },
      selector: { kind: 'page' as const, pageNumber: 1, pageIndex: 0 },
    };
    const secondPage = {
      file: firstPage.file,
      selector: { kind: 'page' as const, pageNumber: 2, pageIndex: 1 },
    };
    const batch = collectBatch([
      turnStart(),
      documentTool('page-1', firstPage),
      documentTool('page-1-repeat', firstPage),
      documentTool('page-2', secondPage),
      assistant('Page comparison'),
      turnEnd(),
    ]);

    const sources = batch?.artifacts.filter((artifact) => artifact.role === 'source');
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'file-reference',
          contentLocator: firstPage,
        }),
        expect.objectContaining({
          kind: 'file-reference',
          contentLocator: secondPage,
        }),
      ]),
    );
    expect(sources).toHaveLength(2);
  });

  it('retains a consumed root locator beside exact selectors from the same container', () => {
    const root = {
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
    };
    const entry = {
      file: root.file,
      selector: { kind: 'entry' as const, path: 'chapters/page.xhtml' },
    };
    const batch = collectBatch([
      turnStart(),
      documentTool('root', root),
      documentTool('entry', entry),
      assistant('Root and page analysis'),
      turnEnd(),
    ]);

    const sources = batch?.artifacts.filter((artifact) => artifact.role === 'source');
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contentLocator: root }),
        expect.objectContaining({ contentLocator: entry }),
      ]),
    );
    expect(sources).toHaveLength(2);
  });

  it('retains one exact document selector when no container root was consumed', () => {
    const page = {
      file: { authority: 'workspace' as const, path: 'books/blame.pdf' },
      selector: { kind: 'page' as const, pageNumber: 1, pageIndex: 0 },
    };
    const batch = collectBatch([
      turnStart(),
      documentTool('page-1', page),
      assistant('Page analysis'),
      turnEnd(),
    ]);

    expect(batch?.artifacts.filter((artifact) => artifact.role === 'source')).toEqual([
      expect.objectContaining({
        contentLocator: page,
      }),
    ]);
  });

  it('projects one image source for a Content-declared image-only document wrapper', () => {
    const wrapper = {
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
      selector: { kind: 'entry' as const, path: 'chapters/opaque-wrapper.xhtml' },
    };
    const image = {
      file: wrapper.file,
      selector: { kind: 'entry' as const, path: 'assets/opaque-image.jpg' },
    };
    const batch = collectBatch([
      turnStart(),
      documentTool('wrapper', wrapper, {
        excerpt: { contentKind: 'image' },
        imageInfo: [{ contentLocator: image }],
      }),
      imageTool('perceived-image', image),
      assistant('Image analysis'),
      turnEnd(),
    ]);

    expect(batch?.artifacts.filter((artifact) => artifact.role === 'source')).toEqual([
      expect.objectContaining({ kind: 'image', contentLocator: image }),
    ]);
    expect(batch?.artifacts.at(-1)).toMatchObject({
      kind: 'markdown',
      sourceArtifactIds: [expect.any(String)],
    });
  });

  it('indexes distinct EPUB page images once without retaining their image-only wrappers', () => {
    const root = {
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
    };
    const firstWrapper = {
      file: root.file,
      selector: { kind: 'entry' as const, path: 'chapters/first.xhtml' },
    };
    const secondWrapper = {
      file: root.file,
      selector: { kind: 'entry' as const, path: 'chapters/second.xhtml' },
    };
    const firstImage = {
      file: root.file,
      selector: { kind: 'entry' as const, path: 'images/first.jpg' },
    };
    const secondImage = {
      file: root.file,
      selector: { kind: 'entry' as const, path: 'images/second.jpg' },
    };
    const batch = collectBatch([
      turnStart(),
      documentTool('manifest', root),
      documentTool('first-wrapper', firstWrapper, {
        excerpt: { contentKind: 'image' },
        imageInfo: [{ contentLocator: firstImage }],
      }),
      imageTool('first-image', firstImage),
      imageTool('first-image-repeat', firstImage),
      documentTool('second-wrapper', secondWrapper, {
        excerpt: { contentKind: 'image' },
        imageInfo: [{ contentLocator: secondImage }],
      }),
      imageTool('second-image', secondImage),
      assistant('Two-page analysis'),
      turnEnd(),
    ]);

    const sources = batch?.artifacts.filter((artifact) => artifact.role === 'source');
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'file-reference', contentLocator: root }),
        expect.objectContaining({ kind: 'image', contentLocator: firstImage }),
        expect.objectContaining({ kind: 'image', contentLocator: secondImage }),
      ]),
    );
    expect(sources).toHaveLength(3);
    expect(sources).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contentLocator: firstWrapper }),
        expect.objectContaining({ contentLocator: secondWrapper }),
      ]),
    );
  });

  it.each(['text', 'mixed'] as const)(
    'retains a %s document entry beside an embedded image source',
    (contentKind) => {
      const wrapper = {
        file: { authority: 'workspace' as const, path: 'books/blame.epub' },
        selector: { kind: 'entry' as const, path: 'chapters/opaque-wrapper.xhtml' },
      };
      const image = {
        file: wrapper.file,
        selector: { kind: 'entry' as const, path: 'assets/opaque-image.jpg' },
      };
      const batch = collectBatch([
        turnStart(),
        documentTool('wrapper', wrapper, {
          excerpt: { contentKind },
          imageInfo: [{ contentLocator: image }],
        }),
        imageTool('perceived-image', image),
        assistant('Mixed analysis'),
        turnEnd(),
      ]);

      expect(batch?.artifacts.filter((artifact) => artifact.role === 'source')).toHaveLength(2);
    },
  );

  it('projects every declared image without retaining an image-only wrapper', () => {
    const wrapper = {
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
      selector: { kind: 'entry' as const, path: 'chapters/opaque-wrapper.xhtml' },
    };
    const firstImage = {
      file: wrapper.file,
      selector: { kind: 'entry' as const, path: 'assets/first.jpg' },
    };
    const secondImage = {
      file: wrapper.file,
      selector: { kind: 'entry' as const, path: 'assets/second.jpg' },
    };
    const batch = collectBatch([
      turnStart(),
      documentTool('wrapper', wrapper, {
        excerpt: { contentKind: 'image' },
        imageInfo: [{ contentLocator: firstImage }, { contentLocator: secondImage }],
      }),
      assistant('Partial image analysis'),
      turnEnd(),
    ]);

    expect(batch?.artifacts.filter((artifact) => artifact.role === 'source')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'image', contentLocator: firstImage }),
        expect.objectContaining({ kind: 'image', contentLocator: secondImage }),
      ]),
    );
    expect(batch?.artifacts.filter((artifact) => artifact.role === 'source')).toHaveLength(2);
  });

  it.each(['interrupted', 'max-tokens', 'failed', 'error', 'cancelled'])(
    'does not deliver a %s turn',
    (reason) => {
      const events = [turnStart(), documentTool('a'), assistant('Analysis'), turnEnd(reason)];
      expect(collectBatch(events)).toBeUndefined();
    },
  );

  it('does not promote ordinary text, source-only reads, or turns without a successful source', () => {
    expect(collectBatch([turnStart(), assistant('Hello'), turnEnd()])).toBeUndefined();
    expect(collectBatch([turnStart(), documentTool('a'), turnEnd()])).toBeUndefined();
    expect(
      collectBatch([
        turnStart(),
        { ...imageTool('failed'), status: 'failed' },
        assistant('Analysis'),
        turnEnd(),
      ]),
    ).toBeUndefined();
  });

  it('isolates a failed sibling Tool and delivers completed source analysis', () => {
    const batch = collectBatch([
      turnStart(),
      documentTool('ok'),
      { ...imageTool('failed'), status: 'failed' },
      assistant('Analysis'),
      turnEnd(),
    ]);

    expect(batch?.artifacts).toMatchObject([
      { kind: 'file-reference', role: 'source', title: 'blame.epub' },
      { kind: 'markdown', role: 'analysis', sourceArtifactIds: [expect.any(String)] },
    ]);
  });

  it('reports and isolates the retired internal ACP envelope', () => {
    const collection = collectDshWorkspaceBoardArtifacts({
      events: [
        turnStart(),
        {
          ...documentTool('retired-envelope'),
          rawInput: {
            operation: 'read',
            input: {
              source: { file: { authority: 'workspace', path: 'books/blame.epub' } },
            },
          },
        },
        assistant('Analysis'),
        turnEnd(),
      ],
      turn: 1,
    });

    expect(collection.batch).toBeUndefined();
    expect(collection.diagnostics).toEqual([
      expect.objectContaining({
        code: 'DSH_WORKSPACE_BOARD_CONTENT_TOOL_PROJECTION_INVALID',
        toolCallId: 'retired-envelope',
        toolName: 'openneko.document',
        message: expect.stringMatching(/arguments\.input is not supported/u),
      }),
    ]);
  });

  it('isolates a completed non-JSON Document result and keeps valid sibling artifacts', () => {
    const malformed = {
      ...documentTool('malformed'),
      rawOutput: [{ type: 'text', text: 'Error: document content could not be read.' }],
    } satisfies DshAcpProjectedEvent;
    const collection = collectDshWorkspaceBoardArtifacts({
      events: [turnStart(), malformed, documentTool('valid'), assistant('Analysis'), turnEnd()],
      turn: 1,
    });

    expect(collection.batch?.artifacts).toMatchObject([
      { kind: 'file-reference', role: 'source', title: 'blame.epub' },
      { kind: 'markdown', role: 'analysis', sourceArtifactIds: [expect.any(String)] },
    ]);
    expect(collection.diagnostics).toEqual([
      expect.objectContaining({
        toolCallId: 'malformed',
        message: 'Completed openneko.document output is not valid JSON.',
      }),
    ]);
  });

  it('collects one exact completed Tool after an earlier turn/start leaves the bounded event window', () => {
    const collection = collectDshWorkspaceBoardCompletedToolArtifacts({
      events: [documentTool('document-1'), documentTool('document-2')],
      toolCallId: 'document-2',
    });

    expect(collection).toMatchObject({
      batch: {
        turn: 1,
        createdAt: 1_000,
        artifacts: [
          {
            kind: 'file-reference',
            role: 'source',
            contentLocator: { file: { authority: 'workspace', path: 'books/blame.epub' } },
          },
        ],
      },
      diagnostics: [],
    });
  });

  it('does not collect pending, failed, or unsupported Tool updates', () => {
    for (const event of [
      { ...documentTool('pending'), status: 'pending' as const },
      { ...documentTool('failed'), status: 'failed' as const },
      { ...documentTool('unsupported'), title: 'bash' },
    ]) {
      expect(
        collectDshWorkspaceBoardCompletedToolArtifacts({
          events: [turnStart(), event],
          toolCallId: event.toolCallId,
        }).batch,
      ).toBeUndefined();
    }
  });

  it('projects image-only Document output directly and deduplicates its later image read', () => {
    const wrapper = {
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
      selector: { kind: 'entry' as const, path: 'chapters/page.xhtml' },
    };
    const image = {
      file: wrapper.file,
      selector: { kind: 'entry' as const, path: 'images/page.jpg' },
    };
    const document = documentTool('document-image', wrapper, {
      excerpt: { contentKind: 'image' },
      imageInfo: [{ contentLocator: image }],
    });
    const incremental = collectDshWorkspaceBoardCompletedToolArtifacts({
      events: [turnStart(), document],
      toolCallId: 'document-image',
    });
    const terminal = collectBatch([
      turnStart(),
      document,
      imageTool('image-read', image),
      assistant('Image analysis'),
      turnEnd(),
    ]);

    expect(incremental.batch?.artifacts).toEqual([
      expect.objectContaining({ kind: 'image', contentLocator: image }),
    ]);
    expect(terminal?.artifacts.filter((artifact) => artifact.role === 'source')).toEqual([
      expect.objectContaining({ kind: 'image', contentLocator: image }),
    ]);
  });
});

describe('DSH Workspace Board artifact delivery service', () => {
  it('targets the exact authoritative Workspace after the terminal projection', async () => {
    const deliveries: DshWorkspaceBoardArtifactDeliveryInput[] = [];
    const service = createDshWorkspaceBoardArtifactDeliveryService({
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
      diagnostics: { report: () => undefined },
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
      delivery: { kind: 'completed-turn' },
    });
  });

  it('reports one invalid completed Tool while delivering valid sibling artifacts', async () => {
    const diagnostics: string[] = [];
    const deliveries: DshWorkspaceBoardArtifactDeliveryInput[] = [];
    const service = createDshWorkspaceBoardArtifactDeliveryService({
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
      diagnostics: { report: (diagnostic) => diagnostics.push(diagnostic.toolCallId) },
    });
    const malformed = {
      ...documentTool('malformed'),
      rawOutput: [{ type: 'text', text: 'Error: document content could not be read.' }],
    } satisfies DshAcpProjectedEvent;

    await expect(
      service.deliverTerminal({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        events: [turnStart(), malformed, documentTool('valid'), assistant('Analysis'), turnEnd()],
      }),
    ).resolves.toEqual({ status: 'accepted' });
    expect(diagnostics).toEqual(['malformed']);
    expect(deliveries).toHaveLength(1);
  });

  it('does not infer a Workspace for a non-Workspace Conversation', async () => {
    let deliveryCount = 0;
    const service = createDshWorkspaceBoardArtifactDeliveryService({
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
      diagnostics: { report: () => undefined },
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

  it('delivers a completed Tool source even when the later turn is interrupted', async () => {
    const deliveries: DshWorkspaceBoardArtifactDeliveryInput[] = [];
    const service = createDshWorkspaceBoardArtifactDeliveryService({
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
      diagnostics: { report: () => undefined },
    });
    const runningEvents = [turnStart(), documentTool('document-1')];

    await expect(
      service.deliverCompletedTool({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        toolCallId: 'document-1',
        events: runningEvents,
      }),
    ).resolves.toEqual({ status: 'accepted' });
    await expect(
      service.deliverTerminal({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        events: [...runningEvents, turnEnd('interrupted')],
      }),
    ).resolves.toBeUndefined();

    expect(deliveries).toEqual([
      expect.objectContaining({
        delivery: { kind: 'completed-content-tool', toolCallId: 'document-1' },
        artifacts: [expect.objectContaining({ role: 'source' })],
      }),
    ]);
  });
});

function collectBatch(
  events: readonly DshAcpProjectedEvent[],
): ReturnType<typeof collectDshWorkspaceBoardArtifacts>['batch'] {
  return collectDshWorkspaceBoardArtifacts({ events, turn: 1 }).batch;
}

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

function documentTool(
  toolCallId: string,
  source: {
    readonly file: { readonly authority: 'workspace'; readonly path: string };
    readonly selector?:
      | { readonly kind: 'entry'; readonly path: string }
      | { readonly kind: 'page'; readonly pageNumber: number; readonly pageIndex: number };
  } = { file: { authority: 'workspace', path: 'books/blame.epub' } },
  result: Readonly<Record<string, unknown>> = {},
): DshAcpProjectedEvent {
  return {
    kind: 'tool',
    sessionId: 'dsh-1',
    toolCallId,
    turn: 1,
    turnStartedAt: 1_000,
    status: 'completed',
    title: 'openneko.document',
    rawInput: {
      operation: 'read',
      source,
      ...(source.selector === undefined ? { mode: 'content' } : {}),
    },
    rawOutput: [{ type: 'text', text: JSON.stringify({ status: 'ready', source, ...result }) }],
  };
}

function imageTool(
  toolCallId: string,
  source: {
    readonly file: { readonly authority: 'workspace'; readonly path: string };
    readonly selector: { readonly kind: 'entry'; readonly path: string };
  } = {
    file: { authority: 'workspace', path: 'books/blame.epub' },
    selector: { kind: 'entry', path: 'images/page-1.jpg' },
  },
): DshAcpProjectedEvent {
  return {
    kind: 'tool',
    sessionId: 'dsh-1',
    toolCallId,
    turn: 1,
    turnStartedAt: 1_000,
    status: 'completed',
    title: 'openneko.read_image',
    rawInput: { source },
  };
}
