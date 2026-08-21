import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { createEmptyCanvasData, planCanvasWorkspaceBoardProjection } from '@neko/canvas-domain';
import {
  createDshWorkspaceBoardContentRead,
  createDshWorkspaceBoardProjectionRequest,
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
      completedAt: 2_000,
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
        {
          kind: 'markdown' as const,
          artifactId: 'content-analysis:analysis',
          contentFingerprint: 'markdown:analysis',
          role: 'analysis' as const,
          title: 'Analysis',
          sourceId: 'artifact:analysis',
          sourceArtifactIds: ['content:source'],
          markdown: 'Analysis',
        },
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
      completedAt: 2_000,
      artifacts: [
        {
          kind: 'markdown' as const,
          artifactId: 'analysis',
          contentFingerprint: 'markdown:analysis',
          role: 'analysis' as const,
          title: 'Analysis',
          sourceId: 'artifact:analysis',
          sourceArtifactIds: ['source'],
          markdown: 'Analysis',
        },
      ],
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
      completedAt: 2_000,
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
});
