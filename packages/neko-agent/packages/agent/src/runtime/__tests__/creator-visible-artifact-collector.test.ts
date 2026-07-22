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
  kind: 'document' as const,
  source: {
    kind: 'file' as const,
    projectRelativePath: 'materials/brief.md',
  },
  locator: { kind: 'file' as const, path: 'materials/brief.md' },
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
        data: { resourceRef: sourceRef },
      },
    ];

    expect(collectCreatorVisibleArtifacts({ toolResults, assistantMarkdown })).toEqual([
      expect.objectContaining({ role: 'source', resourceRef: sourceRef }),
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
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${A}/books/Blame.epub', format: 'epub' as const },
      entryPath: 'OEBPS/images/cover.jpg',
      versionPolicy: 'read-only-source' as const,
    };

    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        {
          name: 'ReadImage',
          success: true,
          data: {
            mode: 'metadata',
            images: [{ resourceRef: documentResourceRef, width: 1024, height: 1536 }],
          },
          attachments: [
            {
              type: 'image',
              path: 'document-entry://cover',
              assetRef: {
                assetId: 'cover-image',
                uri: 'document-entry://cover',
                mimeType: 'image/jpeg',
                documentResourceRef,
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
    const firstPageRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${A}/books/Blame.epub', format: 'epub' as const },
      entryPath: 'OEBPS/images/page-01.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    const secondPageRef = {
      ...firstPageRef,
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
              { resourceRef: firstPageRef, width: 1200, height: 1800 },
              { resourceRef: secondPageRef, width: 1200, height: 1800 },
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
                documentResourceRef: firstPageRef,
              },
            },
            {
              type: 'image',
              path: 'document-entry://page-02',
              assetRef: {
                assetId: 'page-02',
                uri: 'document-entry://page-02',
                mimeType: 'image/jpeg',
                documentResourceRef: secondPageRef,
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
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${A}/books/Blame.epub', format: 'epub' as const },
      entryPath: 'OEBPS/images/cover.jpg',
      versionPolicy: 'read-only-source' as const,
    };

    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        {
          name: 'ReadImage',
          success: true,
          data: {
            mode: 'metadata',
            images: [{ resourceRef: documentResourceRef, width: 1024, height: 1536 }],
          },
          attachments: [
            {
              type: 'image',
              path: 'document-entry://cover',
              assetRef: {
                assetId: 'cover-image',
                uri: 'document-entry://cover',
                mimeType: 'image/jpeg',
                documentResourceRef,
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

  it('coalesces weak and hashed observations of one portable source file', () => {
    const portablePath = '${A}/epub/animation/Blame/volume-01.epub';
    const weakRef = {
      ...sourceRef,
      id: 'res_weak',
      source: { kind: 'file' as const, projectRelativePath: portablePath },
      locator: { kind: 'file' as const, path: portablePath },
      fingerprint: { strategy: 'none' as const, value: portablePath },
    };
    const hashedRef = {
      ...weakRef,
      id: 'res_hashed',
      fingerprint: { strategy: 'hash' as const, value: 'sha256:volume-01' },
    };

    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        { name: 'ReadDocument', success: true, data: { resourceRef: weakRef } },
        { name: 'ReadDocument', success: true, data: { resourceRef: hashedRef } },
      ],
      assistantMarkdown: `~~~NEKO\n${JSON.stringify({
        schemaVersion: 1,
        kind: 'composite-artifact',
        artifactId: 'analysis-1',
        title: 'Material Analysis',
        provenance: { sourceArtifactIds: ['res_weak'] },
        blocks: [{ blockId: 'findings', kind: 'text', text: 'Findings.' }],
      })}\n~~~`,
    });

    expect(collected.filter((candidate) => candidate.role === 'source')).toEqual([
      expect.objectContaining({
        artifactId: 'res_hashed',
        revision: 'sha256:volume-01',
        resourceRef: hashedRef,
      }),
    ]);
    expect(collected.find((candidate) => candidate.role === 'analysis')).toMatchObject({
      sourceArtifactIds: ['res_hashed'],
    });
  });
});
