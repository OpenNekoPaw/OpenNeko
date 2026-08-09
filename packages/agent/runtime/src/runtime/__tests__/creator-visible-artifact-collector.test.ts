import { describe, expect, it } from 'vitest';
import { hashStableValue } from '@neko/shared';
import { contentLocatorKey, type ContentLocator } from '@neko/content';
import { createGeneratedAssetRevisionRef } from '@neko/generation';
import {
  collectCreatorVisibleArtifacts,
  collectCreatorVisibleArtifactsFromTurnProjection,
  deliverCreatorVisibleArtifactsFromTurnProjection,
  type CreatorVisibleToolResult,
} from '../turn/creator-visible-artifact-collector';
import type { ConversationTurnProjection } from '@neko/agent-contracts';

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

  it('uses locator content fingerprints for source candidates', () => {
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
        kind: 'composite-artifact',
        artifactId: 'analysis-1',
        title: 'Material Analysis',
        blocks: [{ blockId: 'findings', kind: 'text', text: 'Findings.' }],
      })}\n~~~`,
    });

    expect(collected.filter((candidate) => candidate.role === 'source')).toEqual([
      expect.objectContaining({ contentLocator: unversionedLocator }),
      expect.objectContaining({
        contentFingerprint: 'sha256:volume-01',
        contentLocator: fingerprintedLocator,
      }),
    ]);
  });

  it('fails visibly when a creator-visible Tool result omits required content locators', () => {
    expect(() =>
      collectCreatorVisibleArtifacts({
        toolResults: [
          {
            success: true,
            attachments: [
              {
                type: 'image',
                path: 'materials/missing-locator.png',
                assetRef: {
                  assetId: 'missing-locator-image',
                  uri: 'materials/missing-locator.png',
                  mimeType: 'image/png',
                },
              },
            ],
          },
        ],
      }),
    ).toThrowError(/requires contentLocator/u);

    expect(() =>
      collectCreatorVisibleArtifacts({
        toolResults: [
          {
            name: 'ReadDocument',
            success: true,
            data: { title: 'Missing locator document' },
          },
        ],
      }),
    ).toThrowError(/requires a valid contentLocator/u);
  });

  it('collects a completed Write Tool result as one Workspace output', () => {
    const collected = collectCreatorVisibleArtifactsFromTurnProjection(
      createTurn({
        toolName: 'Write',
        toolData: {
          contentLocator: { kind: 'workspace-file', path: 'docs/output.md' },
          mode: 'write',
          bytesWritten: 12,
        },
      }),
    );

    expect(collected).toEqual([
      expect.objectContaining({
        role: 'output',
        kind: 'file-reference',
        contentLocator: { kind: 'workspace-file', path: 'docs/output.md' },
      }),
    ]);
  });

  it('does not promote a completed Read Tool without a reviewable artifact', () => {
    expect(
      collectCreatorVisibleArtifactsFromTurnProjection(
        createTurn({
          toolName: 'Read',
          toolData: {
            contentLocator: { kind: 'workspace-file', path: 'docs/source.md' },
            content: '1\tsource',
          },
        }),
      ),
    ).toEqual([]);
  });

  it('keeps Read source provenance when the completed turn declares an analysis', () => {
    const analysis = {
      kind: 'composite-artifact',
      artifactId: 'analysis-from-read',
      title: 'Source Review',
      blocks: [{ blockId: 'findings', kind: 'text', text: 'Reviewed.' }],
    };
    const collected = collectCreatorVisibleArtifactsFromTurnProjection(
      createTurn({
        toolName: 'Read',
        toolData: {
          contentLocator: { kind: 'workspace-file', path: 'docs/source.md' },
          content: '1\tsource',
        },
        assistantMarkdown: `~~~NEKO\n${JSON.stringify(analysis)}\n~~~`,
      }),
    );

    expect(collected.map((candidate) => candidate.role)).toEqual(['source', 'analysis']);
  });

  it('does not collect artifacts from failed or non-terminal turns', () => {
    const failed = createTurn({
      toolName: 'Write',
      toolData: { contentLocator: { kind: 'workspace-file', path: 'docs/output.md' } },
      completionStatus: 'failed',
    });
    const nonTerminal = { ...failed, completion: undefined };

    expect(collectCreatorVisibleArtifactsFromTurnProjection(failed)).toEqual([]);
    expect(collectCreatorVisibleArtifactsFromTurnProjection(nonTerminal)).toEqual([]);
  });

  it('preserves Generation Job evidence for generated Tool attachments', () => {
    const locator = {
      kind: 'generated-output' as const,
      outputId: 'job-1:image:0',
      digest: 'sha256:image-0',
      path: 'neko/generated/image/job-1-image-0.png',
    };
    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        {
          name: 'GenerateImage',
          success: true,
          data: {
            jobKind: 'generation',
            jobId: 'job-1',
            message: 'Draw a city at night',
            routedTo: { model: 'image-model' },
          },
          attachments: [{ type: 'image', contentLocator: locator, mimeType: 'image/png' }],
        },
      ],
    });

    expect(collected).toEqual([
      expect.objectContaining({
        contentLocator: locator,
        mimeType: 'image/png',
        generation: {
          jobRef: { kind: 'generation', jobId: 'job-1' },
          summary: { prompt: 'Draw a city at night', model: 'image-model' },
        },
      }),
    ]);
  });

  it('invokes the terminal delivery port once and localizes Host delivery failure', async () => {
    const turn = createTurn({
      toolName: 'Write',
      toolData: { contentLocator: { kind: 'workspace-file', path: 'docs/output.md' } },
    });
    let calls = 0;

    await expect(
      deliverCreatorVisibleArtifactsFromTurnProjection({
        turn,
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        runId: 'run-1',
        delivery: {
          deliver: async () => {
            calls += 1;
            throw new Error('Board is unavailable.');
          },
        },
      }),
    ).resolves.toEqual({
      status: 'blocked',
      diagnostic: {
        code: 'agent-artifact-delivery-failed',
        message: 'Board is unavailable.',
      },
    });
    expect(calls).toBe(1);
  });

  it('localizes invalid creator-visible Tool results after the Turn is terminal', async () => {
    const turn = createTurn({ toolName: 'ReadDocument', toolData: { title: 'Missing locator' } });

    await expect(
      deliverCreatorVisibleArtifactsFromTurnProjection({
        turn,
        workspaceId: 'workspace-1',
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        runId: 'run-1',
      }),
    ).resolves.toMatchObject({
      status: 'blocked',
      diagnostic: { code: 'agent-artifact-delivery-failed' },
    });
  });
});

function createTurn(input: {
  readonly toolName: string;
  readonly toolData: unknown;
  readonly assistantMarkdown?: string;
  readonly completionStatus?: 'completed' | 'failed' | 'cancelled';
}): ConversationTurnProjection {
  return {
    turnId: 'turn-1',
    runId: 'run-1',
    messageId: 'message-1',
    items: [
      {
        conversationId: 'conversation-1',
        turnId: 'turn-1',
        runId: 'run-1',
        messageId: 'message-1',
        itemId: 'tool-1',
        sequence: 0,
        kind: 'tool_call',
        status: 'succeeded',
        payload: {
          toolCall: {
            id: 'call-1',
            name: input.toolName,
            arguments: {},
            result: { success: true, data: input.toolData },
          },
        },
        createdAt: 1,
        updatedAt: 2,
      },
      ...(input.assistantMarkdown
        ? [
            {
              conversationId: 'conversation-1',
              turnId: 'turn-1',
              runId: 'run-1',
              messageId: 'message-1',
              itemId: 'assistant-1',
              sequence: 1,
              kind: 'assistant_text' as const,
              status: 'complete' as const,
              payload: { content: input.assistantMarkdown, format: 'markdown' as const },
              createdAt: 2,
              updatedAt: 3,
            },
          ]
        : []),
    ],
    completion: { status: input.completionStatus ?? 'completed', completedAt: 4 },
  };
}

function contentSourceId(locator: ContentLocator): string {
  return `content:${hashStableValue(contentLocatorKey(locator))}`;
}
