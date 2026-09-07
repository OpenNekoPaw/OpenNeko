import { describe, expect, it, vi } from 'vitest';
import type { ContentLocator } from '@neko/content-domain';
import type { DshAcpProjectedEvent } from '../acp/dsh-acp-projection';
import {
  collectDshCanvasArtifactCompletedToolArtifacts,
  collectDshCompletedTextWriteReference,
  createDshCanvasArtifactDeliveryService,
} from './dsh-canvas-artifact-delivery';

describe('DSH Canvas completed Tool artifact collection', () => {
  it('collects only explicit local Markdown references, including reference-style image links', () => {
    const event = writeTool('references', 'plans/plan.md');
    const collection = collect({
      ...event,
      rawInput: {
        file_path: 'plans/plan.md',
        content: [
          '[设计](../assets/design.png)',
          '![图][frame]',
          '[frame]: ../generated/shot%201.png',
          '`[代码](fake.png)`',
          '[外部](https://example.com/a.png)',
          '[锚点](#heading)',
          '[越界](../../outside.png)',
          '裸文件名.png',
        ].join('\n\n'),
      },
    });
    expect(collection.diagnostics).toEqual([]);
    expect(collection.batch?.artifacts).toHaveLength(1);
    expect(collection.batch?.artifacts[0]?.referenceLocators).toEqual([
      { file: { authority: 'workspace', path: 'assets/design.png' } },
      { file: { authority: 'workspace', path: 'generated/shot 1.png' } },
    ]);
  });
  it('projects an exact successful native text write as one Canvas output reference', () => {
    const collection = collect(writeTool('write-1', 'plans/blame-volume-1-pv.md'));

    expect(collection.diagnostics).toEqual([]);
    expect(collection.batch).toMatchObject({ turn: 1, createdAt: 1_000 });
    expect(collection.batch?.artifacts).toEqual([
      expect.objectContaining({
        kind: 'file-reference',
        role: 'output',
        title: 'blame-volume-1-pv.md',
        contentLocator: {
          file: { authority: 'workspace', path: 'plans/blame-volume-1-pv.md' },
        },
      }),
    ]);
  });

  it('projects the same completed write identity for a direct document-open handoff', () => {
    const event = writeTool('write-link', 'plans/blame-volume-1-pv.md');

    expect(
      collectDshCompletedTextWriteReference({ events: [event], toolCallId: 'write-link' }),
    ).toEqual({
      toolCallId: 'write-link',
      title: 'blame-volume-1-pv.md',
      contentLocator: {
        file: { authority: 'workspace', path: 'plans/blame-volume-1-pv.md' },
      },
    });
    expect(
      collectDshCompletedTextWriteReference({ events: [event], toolCallId: 'missing' }),
    ).toBeUndefined();
  });

  it.each(['/workspace/plan.md', '../plan.md', 'notes/../plan.md', 'plan.nkc'])(
    'rejects native write path %s instead of projecting an unverified Canvas locator',
    (filePath) => {
      const collection = collect(writeTool('write-invalid', filePath));

      expect(collection.batch).toBeUndefined();
      expect(collection.diagnostics).toEqual([
        expect.objectContaining({
          code: 'DSH_CANVAS_ARTIFACT_TEXT_WRITE_PROJECTION_INVALID',
          toolCallId: 'write-invalid',
          toolName: 'write',
        }),
      ]);
    },
  );

  it('does not project a native write that did not complete successfully', () => {
    const collection = collect({
      ...writeTool('write-failed', 'plans/blame-volume-1-pv.md'),
      status: 'failed',
    });

    expect(collection).toEqual({ diagnostics: [] });
  });

  it('delivers a successful native text write to the exact admitted Canvas', async () => {
    const delivery = vi.fn(async () => ({ status: 'accepted' as const }));
    const service = createDshCanvasArtifactDeliveryService({
      contexts: {
        readContext: async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        }),
      },
      delivery: { deliver: delivery },
      diagnostics: { report: vi.fn() },
    });

    await expect(
      service.deliverCompletedTool({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        toolCallId: 'write-1',
        events: [writeTool('write-1', 'plans/blame-volume-1-pv.md')],
        canvasTurnTarget: {
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/workspace.nkc',
        },
      }),
    ).resolves.toEqual({ status: 'accepted' });

    expect(delivery).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery: { kind: 'completed-tool', toolCallId: 'write-1' },
        artifacts: [
          expect.objectContaining({
            role: 'output',
            contentLocator: {
              file: { authority: 'workspace', path: 'plans/blame-volume-1-pv.md' },
            },
          }),
        ],
      }),
    );
  });

  it('projects only the stable parent document for an exact content selector', () => {
    const source = {
      file: { authority: 'workspace' as const, path: 'books/blame.epub' },
      selector: { kind: 'entry' as const, path: 'OPS/chapter.xhtml' },
    };
    const collection = collect(documentTool('document-1', source));
    expect(collection.diagnostics).toEqual([]);
    expect(collection.batch).toMatchObject({ turn: 1, createdAt: 1_000 });
    expect(collection.batch?.artifacts).toEqual([
      expect.objectContaining({
        kind: 'file-reference',
        role: 'source',
        title: 'blame.epub',
        contentLocator: { file: source.file },
      }),
    ]);
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
    expect(collection.batch?.artifacts).toEqual([
      expect.objectContaining({
        title: 'blame.epub',
        contentLocator: { file: source.file },
      }),
    ]);
  });

  it('projects one contact sheet with ordered source references instead of every original page', () => {
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
        title: '阅读总览（2 页）',
        sourceArtifactIds: [parent?.artifactId],
        referenceLocators: sources,
        overviewAttachment: expect.objectContaining({ attachmentId: 'contact-sheet' }),
      }),
    ]);
  });

  it('delivers an image overview as soon as its Tool event completes', async () => {
    const delivery = vi.fn(async () => ({ status: 'accepted' as const }));
    const service = createDshCanvasArtifactDeliveryService({
      contexts: {
        readContext: async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        }),
      },
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

    expect(delivery).toHaveBeenCalledWith(
      expect.objectContaining({
        turn: 1,
        createdAt: 1_000,
        delivery: { kind: 'completed-tool', toolCallId: 'overview-1' },
        artifacts: [
          expect.objectContaining({ kind: 'file-reference', title: 'blame.epub' }),
          expect.objectContaining({ kind: 'image', title: '阅读总览（2 页）' }),
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

function writeTool(toolCallId: string, filePath: string): DshAcpProjectedEvent {
  return {
    kind: 'tool',
    sessionId: 'dsh-1',
    toolCallId,
    turn: 1,
    turnStartedAt: 1_000,
    status: 'completed',
    title: 'write',
    rawInput: { file_path: filePath, content: '# Durable document\n' },
    rawOutput: [
      {
        type: 'text',
        text: JSON.stringify({ operation: 'create', after: '# Durable document\n' }),
      },
    ],
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
        attachment: {
          attachmentId: 'contact-sheet',
          mediaType: 'image/png',
          bytes: 100,
          width: 1024,
          height: 1024,
          name: 'overview.jpg',
        },
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
