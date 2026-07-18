import { describe, expect, it } from 'vitest';
import { createGeneratedAssetRevisionRef } from '@neko/shared';
import {
  collectCreatorVisibleArtifacts,
  type CreatorVisibleToolResult,
} from '../turn/creator-visible-artifact-collector';

const sourceRef = {
  id: 'source:document-1',
  scope: 'project' as const,
  provider: 'document',
  kind: 'source' as const,
  source: {
    kind: 'source-file' as const,
    projectRelativePath: 'materials/brief.md',
  },
  locator: { kind: 'source-file' as const, projectRelativePath: 'materials/brief.md' },
  fingerprint: { strategy: 'hash' as const, value: 'sha256:source-1' },
};

describe('collectCreatorVisibleArtifacts', () => {
  it('collects consumed durable material, named Markdown, and generated output', () => {
    const toolResults: CreatorVisibleToolResult[] = [
      {
        success: true,
        attachments: [
          {
            type: 'image',
            path: 'materials/brief.png',
            assetRef: {
              assetId: 'brief-image',
              uri: 'materials/brief.png',
              mimeType: 'image/png',
              resourceRef: sourceRef,
            },
          },
          {
            type: 'image',
            path: 'materials/unselected.png',
            assetRef: {
              assetId: 'unselected-image',
              uri: 'materials/unselected.png',
              mimeType: 'image/png',
              resourceRef: { ...sourceRef, id: 'source:unselected' },
            },
          },
        ],
        artifacts: [
          {
            type: 'artifactSnapshot',
            complete: true,
            artifact: {
              schemaVersion: 1,
              kind: 'composite-artifact',
              artifactId: 'analysis-1',
              title: 'Material Analysis',
              blocks: [{ blockId: 'text-1', kind: 'text', text: 'Findings.' }],
            },
          },
        ],
      },
      { success: false, attachments: [{ type: 'image', path: 'failed.png' }] },
    ];

    const collected = collectCreatorVisibleArtifacts({
      toolResults,
      consumedResourceIds: new Set(['source:document-1']),
      generatedLifecycles: [
        createGeneratedAssetRevisionRef({
          assetId: 'generated-1',
          contentDigest: 'sha256:generated-1',
          mediaKind: 'image',
          mimeType: 'image/png',
          generation: { taskId: 'task-1' },
        }),
      ],
    });

    expect(collected).toEqual([
      expect.objectContaining({
        artifactId: 'brief-image',
        role: 'source',
        sourceId: 'source:document-1',
      }),
      expect.objectContaining({
        artifactId: 'analysis-1',
        role: 'analysis',
        kind: 'markdown',
        markdown: '# Material Analysis\n\nFindings.',
      }),
      expect.objectContaining({ artifactId: 'generated-1', role: 'output' }),
    ]);
    expect(collected.some((candidate) => candidate.artifactId === 'failed.png')).toBe(false);
  });
});
