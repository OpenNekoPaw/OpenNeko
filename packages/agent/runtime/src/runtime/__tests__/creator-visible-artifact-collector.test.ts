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
        artifactId: sourceId,
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

  it('does not infer a reviewable artifact from fenced assistant Markdown', () => {
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

    expect(collectCreatorVisibleArtifacts({ toolResults, assistantMarkdown })).toEqual([]);
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

    const firstSourceId = contentSourceId(firstPageLocator);
    const secondSourceId = contentSourceId(secondPageLocator);
    expect(collected).toEqual([
      expect.objectContaining({ artifactId: firstSourceId, role: 'source', kind: 'image' }),
      expect.objectContaining({ artifactId: secondSourceId, role: 'source', kind: 'image' }),
      expect.objectContaining({
        role: 'analysis',
        kind: 'markdown',
        title: 'Storyboard Analysis',
        markdown: '# 分镜分析\n\n第 1 页建立环境，第 2 页推进动作。',
        sourceArtifactIds: [firstSourceId, secondSourceId],
      }),
    ]);
  });

  it('uses locator-derived Canvas source identities for same-named images from different documents', () => {
    const firstLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/volume-1.epub' },
      entryPath: 'images/cover.jpg',
    };
    const secondLocator = {
      kind: 'document-entry' as const,
      source: { kind: 'workspace-file' as const, path: 'books/volume-2.epub' },
      entryPath: 'images/cover.jpg',
    };

    const collected = collectCreatorVisibleArtifacts({
      toolResults: [
        {
          name: 'ReadImage',
          success: true,
          data: {
            analysis: 'storyboard',
            images: [
              { contentLocator: firstLocator, width: 1200, height: 1800 },
              { contentLocator: secondLocator, width: 1200, height: 1800 },
            ],
          },
          attachments: [
            {
              type: 'image',
              assetRef: {
                assetId: 'read-image-cover.jpg-null-null',
                uri: 'content:first-cover',
                contentLocator: firstLocator,
              },
            },
            {
              type: 'image',
              assetRef: {
                assetId: 'read-image-cover.jpg-null-null',
                uri: 'content:second-cover',
                contentLocator: secondLocator,
              },
            },
          ],
        },
      ],
      assistantMarkdown: '# Storyboard analysis\n\nThe covers establish distinct visual motifs.',
    });

    const sources = collected.filter((candidate) => candidate.role === 'source');
    expect(sources).toHaveLength(2);
    expect(new Set(sources.map((candidate) => candidate.artifactId)).size).toBe(2);
    expect(sources.map((candidate) => candidate.artifactId)).not.toContain(
      'read-image-cover.jpg-null-null',
    );
    expect(collected.find((candidate) => candidate.role === 'analysis')?.sourceArtifactIds).toEqual(
      sources.map((candidate) => candidate.artifactId),
    );
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

  it('collects a typed composite artifact once after ReadImage analysis', () => {
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

  it('does not retain source candidates only because Markdown resembles an artifact', () => {
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

    expect(collected).toEqual([]);
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

  it('does not infer analysis provenance from completed-turn Markdown', () => {
    const collected = collectCreatorVisibleArtifactsFromTurnProjection(
      createTurn({
        toolName: 'Read',
        toolData: {
          contentLocator: { kind: 'workspace-file', path: 'docs/source.md' },
          content: '1\tsource',
        },
        assistantMarkdown: `~~~NEKO\n{"kind":"composite-artifact"}\n~~~`,
      }),
    );

    expect(collected).toEqual([]);
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

  it('never calls delivery for an ordinary text-only terminal turn', async () => {
    const turn = createTextOnlyTurn();
    let calls = 0;
    const result = await deliverCreatorVisibleArtifactsFromTurnProjection({
      turn,
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
      delivery: {
        deliver: async () => {
          calls += 1;
          return { status: 'accepted' };
        },
      },
    });
    expect(result).toBeUndefined();
    expect(calls).toBe(0);
  });

  it('passes exact Canvas target to delivery and leaves Board context target absent', async () => {
    const turn = createTurn({
      toolName: 'Write',
      toolData: { contentLocator: { kind: 'workspace-file', path: 'docs/output.md' } },
    });
    let capturedExact: unknown = 'unset';
    await deliverCreatorVisibleArtifactsFromTurnProjection({
      turn,
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
      canvasTurnContext: {
        target: {
          kind: 'exact-canvas',
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/a.nkc',
        },
        summary: { canvasId: 'neko/boards/a.nkc', name: 'A' },
      },
      delivery: {
        deliver: async (input) => {
          capturedExact = input.canvasTurnTarget;
          return { status: 'accepted' };
        },
      },
    });
    expect(capturedExact).toEqual({
      workspaceId: 'workspace-1',
      target: {
        kind: 'exact-canvas',
        workspaceId: 'workspace-1',
        canvasId: 'neko/boards/a.nkc',
      },
    });

    let capturedBoard: unknown = 'unset';
    await deliverCreatorVisibleArtifactsFromTurnProjection({
      turn,
      workspaceId: 'workspace-1',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
      canvasTurnContext: {
        target: { kind: 'workspace-board', workspaceId: 'workspace-1' },
      },
      delivery: {
        deliver: async (input) => {
          capturedBoard = input.canvasTurnTarget;
          return { status: 'accepted' };
        },
      },
    });
    expect(capturedBoard).toBeUndefined();
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

function createTextOnlyTurn(): ConversationTurnProjection {
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
        itemId: 'assistant-1',
        sequence: 0,
        kind: 'assistant_text',
        status: 'complete',
        payload: { content: 'Hello', format: 'markdown' },
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    completion: { status: 'completed', completedAt: 4 },
  };
}

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
