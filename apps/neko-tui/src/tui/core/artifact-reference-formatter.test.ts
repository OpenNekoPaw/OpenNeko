import { describe, expect, it } from 'vitest';
import {
  COMPOSITE_ARTIFACT_KIND,
  COMPOSITE_ARTIFACT_SCHEMA_VERSION,
  createResourceRef,
  type ArtifactMediaItem,
  type PerceptionCard,
  type ToolResultAttachment,
} from '@neko/shared';
import {
  collectTuiArtifactReferences,
  referenceFromArtifactMediaItem,
  referenceFromAttachment,
  referenceFromPerceptionCard,
} from './artifact-reference-formatter';

describe('artifact-reference-formatter', () => {
  it('formats image references with stable asset id and workspace-relative path', () => {
    const attachment: ToolResultAttachment = {
      type: 'image',
      path: '/workspace/demo/neko/generated/shot-01.png',
      mimeType: 'image/png',
      assetRef: {
        assetId: 'asset-img-1',
        uri: '${PROJECT}/neko/generated/shot-01.png',
        mimeType: 'image/png',
        label: 'shot-01',
      },
    };

    const ref = referenceFromAttachment(
      attachment,
      0,
      { taskId: 'task-1', toolCallId: 'call-1' },
      { workspaceRoot: '/workspace/demo' },
    );

    expect(ref).toMatchObject({
      id: 'asset-img-1',
      kind: 'image',
      assetId: 'asset-img-1',
      taskId: 'task-1',
      toolCallId: 'call-1',
      path: '${PROJECT}/neko/generated/shot-01.png',
      probe: 'image/png',
      diagnostics: [],
    });
    expect(ref.commands).toContain('/artifact show asset-img-1');
  });

  it('formats video and audio perception summaries', () => {
    const video = referenceFromPerceptionCard(
      makePerceptionCard('asset-video-1', 'video', {
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        durationMs: 2500,
        frameRate: 24,
      }),
    );
    const audio = referenceFromPerceptionCard(
      makePerceptionCard('asset-audio-1', 'audio', {
        mimeType: 'audio/wav',
        durationMs: 1000,
        channels: 2,
        sampleRate: 48000,
      }),
    );

    expect(video).toMatchObject({
      kind: 'video',
      dimensions: '1920x1080',
      duration: '2.50s',
      probe: 'video/mp4 mp4 24fps',
    });
    expect(audio).toMatchObject({
      kind: 'audio',
      duration: '1s',
      probe: 'audio/wav wav 2ch 48000Hz',
    });
  });

  it('formats document artifact media references', () => {
    const resource = createResourceRef({
      scope: 'project',
      provider: 'document-cache',
      kind: 'document',
      source: {
        kind: 'document',
        filePath: '/workspace/demo/docs/brief.pdf',
        projectRelativePath: 'docs/brief.pdf',
      },
      locator: { kind: 'document', entryPath: 'pages/1.png' },
      fingerprint: { strategy: 'hash', value: 'hash-1' },
    });
    const item: ArtifactMediaItem = {
      itemId: 'doc-page-1',
      mediaType: 'document',
      resourceRef: { kind: 'resource', resource },
      label: 'Brief page 1',
      mimeType: 'application/pdf',
    };

    expect(
      referenceFromArtifactMediaItem(item, { workspaceRoot: '/workspace/demo' }),
    ).toMatchObject({
      id: 'doc-page-1',
      kind: 'document',
      ref: `resource:document-cache:${resource.id}`,
      path: 'docs/brief.pdf',
      probe: 'application/pdf',
    });
  });

  it('collects composite artifact references from tool result transfers', () => {
    const refs = collectTuiArtifactReferences({
      toolCallId: 'call-artifact',
      artifacts: [
        {
          type: 'artifactSnapshot',
          artifact: {
            schemaVersion: COMPOSITE_ARTIFACT_SCHEMA_VERSION,
            kind: COMPOSITE_ARTIFACT_KIND,
            artifactId: 'artifact-1',
            title: 'Shot Plan',
            blocks: [],
            provenance: { source: 'tool', toolCallId: 'call-artifact' },
          },
          complete: true,
        },
      ],
    });

    expect(refs).toEqual([
      expect.objectContaining({
        id: 'artifact-1',
        kind: 'artifact',
        artifactId: 'artifact-1',
        toolCallId: 'call-artifact',
        probe: '0 blocks',
      }),
    ]);
  });

  it('omits webview/blob/temp/cache/absolute paths as durable identities', () => {
    for (const path of [
      'vscode-webview-resource://panel/asset.png',
      'blob:https://neko.local/asset',
      '/tmp/neko/asset.png',
      '/workspace/demo/.neko/.cache/generated/asset.png',
      '/outside/generated/asset.png',
    ]) {
      const ref = referenceFromAttachment(
        { type: 'image', path },
        0,
        { toolCallId: 'call-poison' },
        { workspaceRoot: '/workspace/demo' },
      );
      expect(ref.path).toBeUndefined();
      expect(ref.diagnostics.length).toBeGreaterThan(0);
    }
  });
});

function makePerceptionCard(
  assetId: string,
  modality: PerceptionCard['modality'],
  structural: Partial<PerceptionCard['structural']>,
): PerceptionCard {
  return {
    version: 1,
    assetId,
    modality,
    createdAt: 1000,
    layerStatus: { layer0: 'complete', layer1: 'complete', layer2: 'skipped' },
    structural: {
      format: structural.mimeType?.split('/')[1] ?? 'unknown',
      mimeType: structural.mimeType ?? 'application/octet-stream',
      byteSize: 100,
      ...structural,
    },
  };
}
