import { describe, expect, it } from 'vitest';
import { hashStableValue } from '@neko/shared';
import { contentLocatorKey, type ContentLocator } from '@neko/content';
import { createGeneratedAssetRevisionRef } from '@neko/generation';
import {
  collectCreatorVisibleArtifacts,
  type CreatorVisibleToolResult,
} from '../turn/creator-visible-artifact-collector';

const sourceLocator = {
  kind: 'workspace-file' as const,
  path: 'materials/brief.png',
  fingerprint: { strategy: 'sha256' as const, value: 'sha256:source-1' },
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
              contentLocator: sourceLocator,
            },
          },
          {
            type: 'image',
            path: 'materials/unselected.png',
            assetRef: {
              assetId: 'unselected-image',
              uri: 'materials/unselected.png',
              mimeType: 'image/png',
              contentLocator: {
                kind: 'workspace-file',
                path: 'materials/unselected.png',
              },
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
    const sourceId = contentSourceId(sourceLocator);

    const collected = collectCreatorVisibleArtifacts({
      toolResults,
      consumedContentSourceIds: new Set([sourceId]),
      generatedLifecycles: [
        createGeneratedAssetRevisionRef({
          assetId: 'generated-1',
          contentDigest: 'sha256:generated-1',
          contentPath: 'neko/generated/image/generated-1.png',
          mediaKind: 'image',
          mimeType: 'image/png',
          generation: { operationId: 'operation-generated-1' },
        }),
      ],
    });

    expect(collected).toEqual([
      expect.objectContaining({
        artifactId: 'brief-image',
        role: 'source',
        sourceId,
        contentLocator: sourceLocator,
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

  it('collects an accessed document only with an explicit fenced reviewable artifact', () => {
    const assistantMarkdown = `Review complete.\n\n~~~NEKO\n${JSON.stringify({
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId: 'material-analysis',
      title: 'Material Analysis',
      blocks: [{ blockId: 'findings', kind: 'text', text: 'Selected findings.' }],
    })}\n~~~`;
    const toolResults: CreatorVisibleToolResult[] = [
      {
        name: 'ReadDocument',
        success: true,
        data: { contentLocator: sourceLocator },
      },
    ];

    expect(collectCreatorVisibleArtifacts({ toolResults, assistantMarkdown })).toEqual([
      expect.objectContaining({ role: 'source', contentLocator: sourceLocator }),
      expect.objectContaining({
        artifactId: 'material-analysis',
        role: 'analysis',
        markdown: '# Material Analysis\n\nSelected findings.',
      }),
    ]);
    expect(
      collectCreatorVisibleArtifacts({
        toolResults,
        assistantMarkdown: '# Material Analysis\n\nOrdinary reply only.',
      }),
    ).toEqual([]);
  });

  it('keeps ReadImage intrinsic dimensions with a document-entry attachment', () => {
    const documentLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/Blame.epub' },
      entryPath: 'OEBPS/images/cover.jpg',
    };

    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        {
          name: 'ReadImage',
          success: true,
          data: {
            mode: 'metadata',
            images: [{ contentLocator: documentLocator, width: 1024, height: 1536 }],
          },
          attachments: [
            {
              type: 'image',
              path: 'document-entry://cover',
              assetRef: {
                assetId: 'cover-image',
                uri: 'document-entry://cover',
                mimeType: 'image/jpeg',
                contentLocator: documentLocator,
              },
            },
          ],
        },
      ],
    });

    expect(collected).toEqual([
      expect.objectContaining({
        artifactId: 'cover-image',
        kind: 'image',
        intrinsicDimensions: { width: 1024, height: 1536 },
      }),
    ]);
  });

  it('finalizes explicitly requested native image analysis with its source images', () => {
    const firstPageLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/Blame.epub' },
      entryPath: 'OEBPS/images/page-01.jpg',
    };
    const secondPageLocator = {
      ...firstPageLocator,
      entryPath: 'OEBPS/images/page-02.jpg',
    };

    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        {
          name: 'ReadImage',
          success: true,
          data: {
            mode: 'metadata',
            analysis: 'storyboard',
            images: [
              { contentLocator: firstPageLocator, width: 1200, height: 1800 },
              { contentLocator: secondPageLocator, width: 1200, height: 1800 },
            ],
          },
          attachments: [
            {
              type: 'image',
              path: 'document-entry://page-01',
              assetRef: {
                assetId: 'page-01',
                uri: 'document-entry://page-01',
                mimeType: 'image/jpeg',
                contentLocator: firstPageLocator,
              },
            },
            {
              type: 'image',
              path: 'document-entry://page-02',
              assetRef: {
                assetId: 'page-02',
                uri: 'document-entry://page-02',
                mimeType: 'image/jpeg',
                contentLocator: secondPageLocator,
              },
            },
          ],
        },
      ],
      assistantMarkdown: '# 分镜分析\n\n第 1 页建立环境，第 2 页推进动作。',
    });

    expect(collected).toEqual([
      expect.objectContaining({ artifactId: 'page-01', role: 'source', kind: 'image' }),
      expect.objectContaining({ artifactId: 'page-02', role: 'source', kind: 'image' }),
      expect.objectContaining({
        role: 'analysis',
        kind: 'markdown',
        title: 'Storyboard Analysis',
        markdown: '# 分镜分析\n\n第 1 页建立环境，第 2 页推进动作。',
        sourceArtifactIds: ['page-01', 'page-02'],
      }),
    ]);
  });

  it('does not promote ordinary ReadImage replies without an explicit analysis declaration', () => {
    const documentLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/Blame.epub' },
      entryPath: 'OEBPS/images/cover.jpg',
    };

    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        {
          name: 'ReadImage',
          success: true,
          data: {
            mode: 'metadata',
            images: [{ contentLocator: documentLocator, width: 1024, height: 1536 }],
          },
          attachments: [
            {
              type: 'image',
              path: 'document-entry://cover',
              assetRef: {
                assetId: 'cover-image',
                uri: 'document-entry://cover',
                mimeType: 'image/jpeg',
                contentLocator: documentLocator,
              },
            },
          ],
        },
      ],
      assistantMarkdown: 'This is an ordinary conversational reply.',
    });

    expect(collected).toEqual([
      expect.objectContaining({ artifactId: 'cover-image', role: 'output' }),
    ]);
    expect(collected.some((candidate) => candidate.kind === 'markdown')).toBe(false);
  });

  it('does not duplicate an explicit composite artifact after ReadImage analysis', () => {
    const assistantMarkdown = `~~~NEKO\n${JSON.stringify({
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId: 'declared-storyboard-analysis',
      title: 'Storyboard Analysis',
      blocks: [{ blockId: 'findings', kind: 'text', text: 'Declared findings.' }],
    })}\n~~~`;

    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        {
          name: 'ReadImage',
          success: true,
          data: { mode: 'metadata', analysis: 'storyboard', images: [] },
          artifacts: [
            {
              type: 'artifactSnapshot',
              complete: true,
              artifact: {
                schemaVersion: 1,
                kind: 'composite-artifact',
                artifactId: 'declared-storyboard-analysis',
                title: 'Storyboard Analysis',
                blocks: [{ blockId: 'findings', kind: 'text', text: 'Declared findings.' }],
              },
            },
          ],
        },
      ],
      assistantMarkdown,
    });

    expect(collected.filter((candidate) => candidate.role === 'analysis')).toHaveLength(1);
    expect(collected[0]).toMatchObject({ artifactId: 'declared-storyboard-analysis' });
  });

  it('keeps unversioned and fingerprinted locators as explicit source revisions', () => {
    const portablePath = 'epub/animation/Blame/volume-01.epub';
    const unversionedLocator = {
      kind: 'workspace-file' as const,
      path: portablePath,
    };
    const fingerprintedLocator = {
      ...unversionedLocator,
      fingerprint: { strategy: 'sha256' as const, value: 'sha256:volume-01' },
    };

    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        {
          name: 'ReadDocument',
          success: true,
          data: { contentLocator: unversionedLocator },
        },
        {
          name: 'ReadDocument',
          success: true,
          data: { contentLocator: fingerprintedLocator },
        },
      ],
      assistantMarkdown: `~~~NEKO\n${JSON.stringify({
        schemaVersion: 1,
        kind: 'composite-artifact',
        artifactId: 'analysis-1',
        title: 'Material Analysis',
        blocks: [{ blockId: 'findings', kind: 'text', text: 'Findings.' }],
      })}\n~~~`,
    });

    expect(collected.filter((candidate) => candidate.role === 'source')).toEqual([
      expect.objectContaining({ contentLocator: unversionedLocator }),
      expect.objectContaining({
        revision: 'sha256:volume-01',
        contentLocator: fingerprintedLocator,
      }),
    ]);
  });

  it('fails visibly when a creator-visible Tool result only exposes legacy references', () => {
    expect(() =>
      collectCreatorVisibleArtifacts({
        toolResults: [
          {
            success: true,
            attachments: [
              {
                type: 'image',
                path: 'materials/legacy.png',
                assetRef: {
                  assetId: 'legacy-image',
                  uri: 'materials/legacy.png',
                  mimeType: 'image/png',
                },
              },
            ],
          },
        ],
      }),
    ).toThrowError(/creator-visible-artifact-migration-required/u);

    expect(() =>
      collectCreatorVisibleArtifacts({
        toolResults: [
          {
            name: 'ReadDocument',
            success: true,
            data: { resourceRef: { id: 'legacy-document' } },
          },
        ],
      }),
    ).toThrowError(/creator-visible-artifact-migration-required/u);
  });
});

function contentSourceId(locator: ContentLocator): string {
  return `content:${hashStableValue(contentLocatorKey(locator))}`;
}
