import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { createEmptyCanvasData, planCanvasWorkspaceBoardProjection } from '@neko/canvas-domain';
import { NodeAuthorizedWorkspaceWriter } from '@neko/content/node';
import {
  createDshWorkspaceBoardContentRead,
  createDshWorkspaceBoardProjectionRequest,
  publishDshDurableMarkdownArtifact,
  resolveDshWorkspaceBoardSourceFingerprints,
} from './desktop-dsh-workspace-board-delivery';

describe('Desktop DSH Workspace Board projection request', () => {
  it('derives a stable delivery identity without adding fingerprint data to ContentLocator', () => {
    const workspace: AssetWorkspaceResolution = {
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/openneko-workspace',
      displayName: 'Workspace',
      locator: { kind: 'relative', value: 'openneko-workspace' },
    };
    const input = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      dshSessionId: 'dsh-1',
      turn: 3,
      createdAt: 2_000,
      canvasTurnTarget: workspaceBoardTarget(),
      delivery: { kind: 'completed-turn' as const },
      artifacts: [
        {
          kind: 'file-reference' as const,
          artifactId: 'content:source',
          contentFingerprint: 'locator:source',
          role: 'source' as const,
          title: 'book.epub',
          sourceId: 'content:source',
          contentLocator: { file: { authority: 'workspace' as const, path: 'books/book.epub' } },
        },
        analysisArtifact(['content:source']),
      ],
    };

    const first = createDshWorkspaceBoardProjectionRequest(input, workspace);
    const replay = createDshWorkspaceBoardProjectionRequest(input, workspace);
    expect(first).toEqual(replay);
    expect(first.process.deliveryId).toMatch(/^dsh-turn:/u);
    expect(first.target.documentUri).toBeUndefined();
    expect(first.artifacts[0]).toMatchObject({
      contentLocator: { file: { authority: 'workspace', path: 'books/book.epub' } },
    });
    expect(first.artifacts[0]).not.toHaveProperty('contentLocator.fingerprint');

    const projected = planCanvasWorkspaceBoardProjection(createEmptyCanvasData('Workspace'), first);
    expect(projected).toMatchObject({ status: 'projected' });
    expect(projected.canvasData.nodes).toHaveLength(2);
    expect(projected.canvasData.connections).toHaveLength(1);
    expect(projected.canvasData.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'file',
          data: expect.objectContaining({
            contentLocator: analysisArtifact(['content:source']).contentLocator,
            mediaType: 'text/markdown',
          }),
        }),
      ]),
    );
    const replayed = planCanvasWorkspaceBoardProjection(projected.canvasData, replay);
    expect(replayed.status).toBe('noop');
    expect(replayed.canvasData.nodes).toHaveLength(2);
    expect(replayed.canvasData.connections).toHaveLength(1);
  });

  it('changes delivery identity for another DSH turn', () => {
    const workspace: AssetWorkspaceResolution = {
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/openneko-workspace',
      displayName: 'Workspace',
      locator: { kind: 'relative', value: 'openneko-workspace' },
    };
    const base = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      dshSessionId: 'dsh-1',
      createdAt: 2_000,
      canvasTurnTarget: workspaceBoardTarget(),
      delivery: { kind: 'completed-turn' as const },
      artifacts: [analysisArtifact(['source'])],
    };
    expect(
      createDshWorkspaceBoardProjectionRequest({ ...base, turn: 1 }, workspace).process.deliveryId,
    ).not.toBe(
      createDshWorkspaceBoardProjectionRequest({ ...base, turn: 2 }, workspace).process.deliveryId,
    );
  });

  it('resolves source freshness without changing locator identity', async () => {
    const input = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      dshSessionId: 'dsh-1',
      turn: 1,
      createdAt: 2_000,
      canvasTurnTarget: workspaceBoardTarget(),
      delivery: { kind: 'completed-content-tool' as const, toolCallId: 'tool-1' },
      artifacts: [
        {
          kind: 'file-reference' as const,
          artifactId: 'content:source',
          contentFingerprint: 'locator:source',
          role: 'source' as const,
          title: 'book.epub',
          sourceId: 'content:source',
          contentLocator: {
            file: { authority: 'workspace' as const, path: 'books/book.epub' },
          },
        },
      ],
    };

    const resolved = await resolveDshWorkspaceBoardSourceFingerprints(input, {
      stat: async (locator) => ({
        status: 'ready',
        locator,
        byteLength: 42,
        fingerprint: { strategy: 'sha256', value: 'book-content' },
      }),
    });

    expect(resolved.artifacts[0]).toMatchObject({
      contentFingerprint: 'content:sha256:book-content',
      contentLocator: { file: { authority: 'workspace', path: 'books/book.epub' } },
    });
  });

  it('gives completed Tools stable identities distinct from each other and the terminal turn', () => {
    const workspace: AssetWorkspaceResolution = {
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/openneko-workspace',
      displayName: 'Workspace',
      locator: { kind: 'relative', value: 'openneko-workspace' },
    };
    const base = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      dshSessionId: 'dsh-1',
      turn: 1,
      createdAt: 1_000,
      canvasTurnTarget: workspaceBoardTarget(),
      artifacts: [
        {
          kind: 'file-reference' as const,
          artifactId: 'content:source',
          contentFingerprint: 'locator:source',
          role: 'source' as const,
          title: 'book.epub',
          sourceId: 'content:source',
          contentLocator: { file: { authority: 'workspace' as const, path: 'books/book.epub' } },
        },
      ],
    };
    const firstTool = createDshWorkspaceBoardProjectionRequest(
      { ...base, delivery: { kind: 'completed-content-tool', toolCallId: 'tool-1' } },
      workspace,
    );
    const firstToolReplay = createDshWorkspaceBoardProjectionRequest(
      { ...base, delivery: { kind: 'completed-content-tool', toolCallId: 'tool-1' } },
      workspace,
    );
    const secondTool = createDshWorkspaceBoardProjectionRequest(
      { ...base, delivery: { kind: 'completed-content-tool', toolCallId: 'tool-2' } },
      workspace,
    );
    const terminal = createDshWorkspaceBoardProjectionRequest(
      { ...base, delivery: { kind: 'completed-turn' } },
      workspace,
    );

    expect(firstTool).toEqual(firstToolReplay);
    expect(firstTool.process.deliveryId).toMatch(/^dsh-tool:/u);
    expect(secondTool.process.deliveryId).not.toBe(firstTool.process.deliveryId);
    expect(terminal.process.deliveryId).toMatch(/^dsh-turn:/u);
    expect(terminal.process.deliveryId).not.toBe(firstTool.process.deliveryId);
  });

  it('reuses an incrementally delivered source when terminal analysis arrives', () => {
    const workspace: AssetWorkspaceResolution = {
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/openneko-workspace',
      displayName: 'Workspace',
      locator: { kind: 'relative', value: 'openneko-workspace' },
    };
    const source = {
      kind: 'image' as const,
      artifactId: 'content:image',
      contentFingerprint: 'content:sha256:image',
      role: 'source' as const,
      title: 'page.jpg',
      sourceId: 'content:image',
      contentLocator: {
        file: { authority: 'workspace' as const, path: 'books/book.epub' },
        selector: { kind: 'entry' as const, path: 'images/page.jpg' },
      },
    };
    const base = {
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      dshSessionId: 'dsh-1',
      turn: 1,
      canvasTurnTarget: workspaceBoardTarget(),
    };
    const incremental = createDshWorkspaceBoardProjectionRequest(
      {
        ...base,
        createdAt: 1_000,
        delivery: { kind: 'completed-content-tool', toolCallId: 'document-1' },
        artifacts: [source],
      },
      workspace,
    );
    const terminal = createDshWorkspaceBoardProjectionRequest(
      {
        ...base,
        createdAt: 2_000,
        delivery: { kind: 'completed-turn' },
        artifacts: [source, analysisArtifact([source.artifactId])],
      },
      workspace,
    );

    const afterIncremental = planCanvasWorkspaceBoardProjection(
      createEmptyCanvasData('Workspace'),
      incremental,
    );
    const afterTerminal = planCanvasWorkspaceBoardProjection(afterIncremental.canvasData, terminal);

    expect(afterIncremental.canvasData.nodes).toHaveLength(1);
    expect(afterTerminal.canvasData.nodes).toHaveLength(2);
    expect(afterTerminal.canvasData.connections).toHaveLength(1);
    expect(afterTerminal.canvasData.nodes.filter((node) => node.type === 'media')).toHaveLength(1);
  });

  it('projects to the exact Canvas selected at turn admission', () => {
    const workspace: AssetWorkspaceResolution = {
      workspaceId: 'workspace-1',
      workspacePath: '/tmp/openneko-workspace',
      displayName: 'Workspace',
      locator: { kind: 'relative', value: 'openneko-workspace' },
    };
    const request = createDshWorkspaceBoardProjectionRequest(
      {
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-1',
        turn: 1,
        createdAt: 1_000,
        canvasTurnTarget: {
          kind: 'exact-canvas',
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/story.nkc',
        },
        delivery: { kind: 'completed-turn' },
        artifacts: [analysisArtifact(['source'])],
      },
      workspace,
    );

    expect(request.target.documentUri).toBe('file:///tmp/openneko-workspace/neko/boards/story.nkc');
  });

  it('resolves document-entry ContentLocators through the canonical entry reader', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'openneko-dsh-board-entry-'));
    const sourcePath = join(workspacePath, 'book.epub');
    await writeFile(sourcePath, 'container');
    const reader = createDshWorkspaceBoardContentRead({
      workspacePath,
      documentEntryReader: {
        readEntry: async (actualSourcePath, entryPath) => {
          expect(actualSourcePath).toBe(sourcePath);
          expect(entryPath).toBe('images/page-1.jpg');
          return new Uint8Array([1, 2, 3]);
        },
      },
    });
    const locator = {
      file: { authority: 'workspace' as const, path: 'book.epub' },
      selector: { kind: 'entry' as const, path: 'images/page-1.jpg' },
    };

    await expect(reader.stat(locator)).resolves.toMatchObject({
      status: 'ready',
      locator,
      byteLength: 3,
      fingerprint: { strategy: 'sha256' },
    });
  });

  it('publishes Markdown once and accepts only byte-identical replay', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'openneko-dsh-markdown-'));
    const read = createDshWorkspaceBoardContentRead({
      workspacePath,
      documentEntryReader: {
        readEntry: async () => {
          throw new Error('Unexpected document entry read.');
        },
      },
    });
    const writer = new NodeAuthorizedWorkspaceWriter({ workspaceRoot: workspacePath });
    const input = {
      workspaceId: 'workspace-1',
      contentLocator: analysisArtifact(['source']).contentLocator,
      markdown: '# Durable analysis\n\nResult.',
      contentFingerprint: 'markdown:durable',
    };

    await expect(publishDshDurableMarkdownArtifact(input, { writer, read })).resolves.toEqual({
      contentLocator: input.contentLocator,
      contentFingerprint: input.contentFingerprint,
    });
    await expect(publishDshDurableMarkdownArtifact(input, { writer, read })).resolves.toEqual({
      contentLocator: input.contentLocator,
      contentFingerprint: input.contentFingerprint,
    });
    await expect(
      publishDshDurableMarkdownArtifact({ ...input, markdown: '# Changed' }, { writer, read }),
    ).rejects.toThrow('conflicts with existing Workspace content');
    await expect(
      readFile(join(workspacePath, input.contentLocator.file.path), 'utf8'),
    ).resolves.toBe(input.markdown);
  });
});

function workspaceBoardTarget() {
  return { kind: 'workspace-board' as const, workspaceId: 'workspace-1' };
}

function analysisArtifact(sourceArtifactIds: readonly string[]) {
  return {
    kind: 'file-reference' as const,
    artifactId: 'content-analysis:analysis',
    contentFingerprint: 'markdown:analysis',
    role: 'analysis' as const,
    title: 'Analysis',
    sourceId: 'artifact:analysis',
    sourceArtifactIds,
    mimeType: 'text/markdown' as const,
    contentLocator: {
      file: {
        authority: 'workspace' as const,
        path: 'neko/generated/file/analysis.md',
      },
    },
  };
}
