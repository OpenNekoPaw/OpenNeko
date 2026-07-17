import { describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type CanvasStoryboardPayload,
  type CanvasMarkdownCapabilityInput,
  type CanvasMarkdownResourceRef,
  type ResourceRef,
  type StoryboardTable,
} from '@neko/shared';
import {
  invokeCanvasMarkdownCapability,
  type CanvasMarkdownCapabilityOperations,
} from '../markdownCapabilities';

describe('Canvas Markdown capabilities', () => {
  it('creates Markdown notes through Canvas-owned text content operations', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createMarkdownNote',
        markdown: '## Plan\n\nKeep the shot order reviewable.',
        title: 'Plan',
        target: { insertionPoint: { x: 12, y: 24 }, mode: 'insert' },
        provenance: { source: 'agent', messageId: 'message-1' },
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.createMarkdownNote',
      status: 'created',
      nodeIds: ['note-1'],
      diagnostics: [],
    });
    expect(operations.applyAgentContent).toHaveBeenCalledWith({
      kind: 'text',
      text: '## Plan\n\nKeep the shot order reviewable.',
      title: 'Plan',
      format: 'markdown',
      target: { insertionPoint: { x: 12, y: 24 }, mode: 'insert' },
      provenance: { source: 'agent', messageId: 'message-1' },
    });
  });

  it('creates a Canvas table node from a GFM table and preserves extra columns', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createTableFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action | Custom Field |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | neon door | review | keep this |',
        ].join('\n'),
        title: 'Storyboard Plan',
        tableTitle: 'Draft Table',
        sourceFormat: 'gfm-table',
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.tableNodeId).toBe('table-1');
    expect(result.preview).toMatchObject({
      tableCount: 1,
      rowCount: 1,
      resourceTokenCount: 1,
      unresolvedResourceTokenCount: 0,
      resolvedKind: 'generic-table',
      profileId: 'generic',
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        label: 'Draft Table',
        rowCount: 1,
        columnCount: 6,
        markdown: expect.objectContaining({
          sourceFormat: 'gfm-table',
          resolvedKind: 'generic-table',
          tableProfile: 'generic',
          reviewKind: 'generic-table',
          displayFallback: false,
          consumedColumns: [
            expect.objectContaining({
              fieldId: 'resource',
              columnId: 'image',
              valueType: 'resource-token',
            }),
          ],
          unknownColumnPolicy: 'preserve',
          unknownColumns: expect.arrayContaining([
            expect.objectContaining({ id: 'scene', label: 'Scene' }),
            expect.objectContaining({ id: 'custom-field', label: 'Custom Field' }),
          ]),
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({
                'custom-field': 'keep this',
              }),
            }),
          ],
          resources: [expect.objectContaining({ token: 'P1', status: 'bound' })],
        }),
      }),
      'table.basic',
    );
  });

  it('creates review-first storyboard tables with resource diagnostics instead of guessing order', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | neon door | review |',
          '| Opening | 2 | P2 | close-up | create |',
        ].join('\n'),
        title: 'Opening Draft',
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('needs-review');
    expect(result.resolvedKind).toBe('creative-table');
    expect(result.profileId).toBe('storyboard');
    expect(result.tableNodeId).toBe('table-1');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'canvas-markdown-missing-resource-token',
    );
    expect(result.actions).toEqual([
      {
        actionId: 'create-storyboard-nodes',
        label: 'Create storyboard nodes',
        capabilityId: 'canvas.createStoryboardFromMarkdown',
      },
    ]);
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        label: 'Opening Draft',
        markdown: expect.objectContaining({
          resolvedKind: 'creative-table',
          tableProfile: 'storyboard',
          reviewKind: 'storyboard',
          creative: true,
          consumedColumns: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'scene', columnId: 'scene', role: 'approval' }),
            expect.objectContaining({ fieldId: 'shot', columnId: 'shot', role: 'approval' }),
            expect.objectContaining({
              fieldId: 'source',
              columnId: 'image',
              role: 'approval',
              valueType: 'resource-token',
            }),
            expect.objectContaining({
              fieldId: 'prompt',
              columnId: 'prompt',
              role: 'plan',
              valueType: 'prompt',
            }),
            expect.objectContaining({
              fieldId: 'nextAction',
              columnId: 'next-action',
              role: 'plan',
            }),
          ]),
          resources: expect.arrayContaining([
            expect.objectContaining({ token: 'P1', status: 'bound' }),
            expect.objectContaining({ token: 'P2', status: 'missing' }),
          ]),
        }),
      }),
      'table.basic',
    );
  });

  it('requires explicit create-nodes mode and lifecycle approval before production storyboard node creation', async () => {
    const operations = createOperations();
    const blocked = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        markdown: STORYBOARD_MARKDOWN,
      },
      operations,
    );

    expect(blocked.status).toBe('blocked');
    expect(blocked.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-storyboard-profile-create-not-confirmed',
    ]);
    expect(operations.createStoryboard).not.toHaveBeenCalled();

    const unapproved = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        markdown: STORYBOARD_MARKDOWN,
        title: 'Opening',
        mode: 'create-nodes',
      },
      operations,
    );

    expect(unapproved.status).toBe('blocked');
    expect(unapproved.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-storyboard-profile-create-approval-required',
    ]);
    expect(operations.createStoryboard).not.toHaveBeenCalled();

    const created = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        markdown: STORYBOARD_MARKDOWN,
        title: 'Opening',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
      },
      operations,
    );

    expect(created.status).toBe('created');
    expect(created.documentUri).toBe('file:///workspace/Storyboard.nkc');
    expect(created.nodeIds).toEqual(['scene-1', 'shot-1', 'shot-2']);
    const payload = readStoryboardPayload(operations);
    expect(payload).toMatchObject({
      mode: 'semantic',
      scenes: [
        expect.objectContaining({
          sceneTitle: 'Opening',
          storyboardPrompt: expect.objectContaining({
            promptBlocks: expect.objectContaining({
              videoPromptDocument: expect.objectContaining({
                text: 'scene video: wide view establishes the room, then cut to close-up',
                blockKind: 'video',
                fieldProjections: expect.arrayContaining([
                  expect.objectContaining({ fieldId: 'scene.videoPrompt' }),
                ]),
              }),
            }),
          }),
          shotPlans: expect.arrayContaining([
            expect.objectContaining({
              shotNumber: 1,
              visualDescription: 'Wide view',
              storyboardPrompt: expect.objectContaining({
                promptBlocks: expect.objectContaining({
                  imagePromptDocument: expect.objectContaining({
                    text: 'cinematic wide prompt',
                    blockKind: 'image',
                  }),
                }),
              }),
            }),
          ]),
        }),
      ],
    });
    const secondShot = payload.scenes[0]?.shotPlans[1];
    expect(secondShot).toMatchObject({
      shotNumber: 2,
      visualDescription: 'Close-up',
      storyboardPrompt: expect.objectContaining({
        promptBlocks: expect.objectContaining({
          imagePromptDocument: expect.objectContaining({ text: 'close prompt' }),
        }),
      }),
    });
    expect(
      payload.scenes[0]?.shotPlans[0]?.storyboardPrompt?.promptBlocks?.videoPromptDocument,
    ).toBeUndefined();
    expect(secondShot?.storyboardPrompt?.promptBlocks?.videoPromptDocument).toBeUndefined();
    expect(payload.scenes[0]?.shotPlans[0]).not.toHaveProperty('generationPrompt');
    expect(secondShot).not.toHaveProperty('generationPrompt');
  });

  it('binds Markdown storyboard resources by explicit alias during production creation', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        markdown: [
          '| scene | shot | source | visual | imagePrompt | videoPrompt |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1#panel_1 | Wide view | clean keyframe | scene video prompt |',
        ].join('\n'),
        title: 'Alias Binding',
        mode: 'create-nodes',
        resources: [
          {
            alias: 'P1',
            label: 'read-image-cover.jpg',
            documentResourceRef: {
              kind: 'document-entry',
              source: {
                filePath: '${A}/epub/animation/test.epub',
                format: 'epub',
              },
              entryPath: 'image/cover.jpg',
              versionPolicy: 'versioned-export',
            },
          },
        ],
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'canvas-markdown-missing-resource-token',
    );
    const shot = readFirstStoryboardShot(readStoryboardPayload(operations));
    expect(shot.referenceImageResourceRef).toMatchObject({
      kind: 'document-entry',
      entryPath: 'image/cover.jpg',
    });
    expect(shot.sourceMediaRefs?.[0]).toMatchObject({
      refId: 'P1',
      documentResourceRef: expect.objectContaining({ entryPath: 'image/cover.jpg' }),
      metadata: { markdownSourcePanel: 'panel_1' },
    });
  });

  it('attaches stable resource refs to an existing Canvas target', async () => {
    const operations = createOperations();
    const resource = createResource('P1');
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.attachResource',
        target: { nodeId: 'shot-1', mode: 'apply' },
        resource,
        role: 'reference',
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.attachResource',
      status: 'changed',
      nodeIds: ['shot-1'],
      diagnostics: [],
    });
    expect(operations.updateNode).toHaveBeenCalledWith(
      'shot-1',
      expect.objectContaining({
        markdownResourceToken: 'P1',
        markdownResourceRole: 'reference',
        referenceResourceRef: resource.resourceRef,
      }),
    );
  });

  it('validates storyboard tables without mutating Canvas state', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.validateMarkdownStoryboard',
        profileHint: 'storyboard.ai-native',
        markdown: STORYBOARD_MARKDOWN,
      },
      operations,
    );

    expect(result.status).toBe('validated');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'canvas-markdown-unsupported-table-profile',
    );
    expect(result.preview).toMatchObject({ tableCount: 1, rowCount: 2 });
    expect(operations.createNode).not.toHaveBeenCalled();
    expect(operations.createStoryboard).not.toHaveBeenCalled();
    expect(operations.updateNode).not.toHaveBeenCalled();
  });

  it('blocks validation when operation hints conflict with a non-creative profile hint', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.validateMarkdownStoryboard',
        operationHint: 'video.scene.generate',
        profileHint: 'generic',
        markdown: [
          '| scene | shot | visual | videoPrompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | wide reveal | slow scene journey |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-operation-profile-mismatch',
        fieldKey: 'operationHint',
      }),
    ]);
    expect(operations.createNode).not.toHaveBeenCalled();
    expect(operations.createStoryboard).not.toHaveBeenCalled();
    expect(operations.updateNode).not.toHaveBeenCalled();
  });

  it('ingests Markdown notes through the unified Canvas facade', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        markdown: '## Review\n\nKeep these notes on the board.',
        title: 'Review Note',
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'created',
      resolvedKind: 'markdown-note',
      nodeIds: ['note-1'],
      preview: expect.objectContaining({
        resolvedKind: 'markdown-note',
      }),
    });
    expect(operations.applyAgentContent).toHaveBeenCalled();
    expect(operations.createNode).not.toHaveBeenCalled();
  });

  it('ingests generic Markdown tables with media-aware display metadata', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        markdown: [
          '| Image | Notes | Extra |',
          '| --- | --- | --- |',
          '| `read-image-cover.jpg` | cover option | keep |',
        ].join('\n'),
        resources: [
          {
            token: 'read-image-cover.jpg',
            label: 'Cover',
            sourcePath: 'assets/read-image-cover.jpg',
          },
        ],
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'created',
      resolvedKind: 'generic-table',
      profileId: 'generic',
      displayFallback: false,
      preview: expect.objectContaining({
        resourceTokenCount: 1,
        unresolvedResourceTokenCount: 0,
        table: expect.objectContaining({
          profileId: 'generic',
          unknownColumns: expect.arrayContaining([expect.objectContaining({ id: 'notes' })]),
        }),
      }),
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          tableProfile: 'generic',
          resources: [expect.objectContaining({ token: 'read-image-cover.jpg', status: 'bound' })],
          unknownColumns: expect.arrayContaining([expect.objectContaining({ id: 'notes' })]),
        }),
      }),
      'table.basic',
    );
  });

  it('ingests storyboard creative tables through the built-in storyboard profile', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| Scene | Shot | Image | Visual | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | wide shot | cinematic light | create |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'created',
      resolvedKind: 'creative-table',
      profileId: 'storyboard',
      tableNodeId: 'table-1',
      actions: [
        {
          actionId: 'create-storyboard-nodes',
          label: 'Create storyboard nodes',
          capabilityId: 'canvas.createStoryboardFromMarkdown',
        },
      ],
      preview: expect.objectContaining({
        resolvedKind: 'creative-table',
        profileId: 'storyboard',
        table: expect.objectContaining({
          profileId: 'storyboard',
          consumedColumns: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'visual', role: 'approval' }),
            expect.objectContaining({ fieldId: 'prompt', role: 'plan' }),
            expect.objectContaining({ fieldId: 'nextAction', role: 'plan' }),
          ]),
        }),
      }),
    });
  });

  it('treats operation hints as storyboard ingest signals with canonical prompt columns', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        operationHint: 'video.scene.generate',
        markdown: [
          '| scene | shot | visual | videoPrompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | wide reveal | generate a continuous scene video with a slow push |',
        ].join('\n'),
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'created',
      resolvedKind: 'creative-table',
      profileId: 'storyboard',
      tableNodeId: 'table-1',
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'canvas-markdown-operation-required-field-missing',
    );
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          resolvedKind: 'creative-table',
          tableProfile: 'storyboard',
          reviewKind: 'storyboard',
          creative: true,
        }),
      }),
      'table.basic',
    );
  });

  it('blocks ingest when operation hints conflict with a non-creative profile hint', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        operationHint: 'video.scene.generate',
        profileHint: 'generic',
        markdown: [
          '| scene | shot | visual | videoPrompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | wide reveal | slow push |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-operation-profile-mismatch',
        fieldKey: 'operationHint',
      }),
    ]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'canvas-markdown-operation-required-field-missing',
    );
    expect(operations.createNode).not.toHaveBeenCalled();
  });

  it('blocks invalid operation hints before Canvas operations are called', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        operationHint: 'video.remote.unknown',
        markdown: [
          '| scene | shot | visual | videoPrompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | wide reveal | slow scene journey |',
        ].join('\n'),
      } as unknown as CanvasMarkdownCapabilityInput,
      operations,
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-unsupported-operation-hint',
        fieldKey: 'operationHint',
      }),
    ]);
    expect(operations.applyAgentContent).not.toHaveBeenCalled();
    expect(operations.createNode).not.toHaveBeenCalled();
    expect(operations.createStoryboard).not.toHaveBeenCalled();
    expect(operations.updateNode).not.toHaveBeenCalled();
  });

  it('consumes shared storyboard fields including localized prompt slots and review metadata', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| 场景 | 镜头 | 来源 | 来源分格 | 决策 | 画面 | 图像提示词 | 视频提示词 | 审阅状态 | 建议操作 | 决策理由 | 需要拆分 |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          '| 开场 | 1 | P1#panel_1 | 右上 | keep | 巨构空间 | 黑白关键帧；生成 | 视频生成：缓慢推进，30s 连续探索 | needs-review | use-as-reference | 建立空间 | true |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'canvas-storyboard-profile-next-action-missing',
    );
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          consumedColumns: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'source', columnId: '来源' }),
            expect.objectContaining({ fieldId: 'sourcePanel', role: 'approval' }),
            expect.objectContaining({ fieldId: 'decision', role: 'approval' }),
            expect.objectContaining({ fieldId: 'imagePrompt', role: 'plan', valueType: 'prompt' }),
            expect.objectContaining({
              fieldId: 'videoPrompt',
              role: 'plan',
              valueType: 'prompt',
            }),
            expect.objectContaining({ fieldId: 'nextAction', role: 'plan' }),
          ]),
          unknownColumns: [],
        }),
      }),
      'table.basic',
    );
  });

  it('keeps operation-targeted storyboard tables reviewable when required fields are missing', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        operationHint: 'video.scene.generate',
        markdown: [
          '| scene | shot | visual | imagePrompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | wide reveal | keyframe only |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('needs-review');
    expect(result.tableNodeId).toBe('table-1');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'canvas-markdown-operation-required-field-missing',
        fieldKey: 'videoPrompt',
      }),
    );
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          tableProfile: 'storyboard',
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({
                imageprompt: 'keyframe only',
              }),
            }),
          ],
        }),
      }),
      'table.basic',
    );
  });

  it('does not add operation required field diagnostics when the required field has content', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        operationHint: 'video.scene.generate',
        markdown: [
          '| scene | shot | visual | videoPrompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | wide reveal | slow scene journey |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'canvas-markdown-operation-required-field-missing',
    );
  });

  it('preserves custom review metadata while consuming all shared storyboard aliases', async () => {
    const operations = createOperations();
    await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| scene | shot | source | visual | imagePrompt | customRisk |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | wide shot | keyframe | high OCR uncertainty |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          consumedColumns: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'imagePrompt' }),
          ]),
          unknownColumns: [expect.objectContaining({ label: 'customRisk' })],
        }),
      }),
      'table.basic',
    );
  });

  it('consumes normalized creative table headers and preserves extension columns', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| scene | shot | source | sourcePanel | decision | duration | visual | motion | audio | characters | dialogue | prompt | reviewStatus | nextAction |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1#panel_1 | top | keep | 3s | wide shot | slow push | wind | Moe |  | cinematic light | needs-review | use-as-reference |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.preview).toMatchObject({
      resolvedKind: 'creative-table',
      profileId: 'storyboard',
      resourceTokenCount: 1,
      unresolvedResourceTokenCount: 0,
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          tableProfile: 'storyboard',
          consumedColumns: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'source', columnId: 'source' }),
            expect.objectContaining({ fieldId: 'sourcePanel', columnId: 'sourcepanel' }),
            expect.objectContaining({ fieldId: 'decision', columnId: 'decision' }),
            expect.objectContaining({ fieldId: 'visual', columnId: 'visual' }),
            expect.objectContaining({ fieldId: 'prompt', columnId: 'prompt' }),
            expect.objectContaining({ fieldId: 'reviewStatus', columnId: 'reviewstatus' }),
            expect.objectContaining({ fieldId: 'nextAction', columnId: 'nextaction' }),
          ]),
          unknownColumns: [],
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({
                source: 'P1#panel_1',
                sourcepanel: 'top',
                decision: 'keep',
                reviewstatus: 'needs-review',
                nextaction: 'use-as-reference',
              }),
            }),
          ],
          resources: [expect.objectContaining({ token: 'P1', status: 'bound' })],
        }),
      }),
      'table.basic',
    );
  });

  it('falls back unsupported creative profiles to display-only generic tables', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'interactive-video-branch-map',
        markdown: [
          '| Branch | Image | Decision Reason |',
          '| --- | --- | --- |',
          '| A | P1 | user choice |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result).toMatchObject({
      capabilityId: 'canvas.ingestMarkdown',
      status: 'needs-review',
      resolvedKind: 'generic-table',
      profileId: 'generic',
      displayFallback: true,
    });
    expect(result.actions).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'canvas-markdown-unsupported-table-profile',
    );
    expect(operations.createStoryboard).not.toHaveBeenCalled();
  });

  it('preserves one-image-to-many-shots and many-images-to-one-shot bindings by explicit tokens', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | establish panel | review |',
          '| Opening | 2 | P1 P2 | split details | review |',
        ].join('\n'),
        resources: [createResource('P2'), createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.diagnostics).toEqual([]);
    expect(result.preview).toMatchObject({
      rowCount: 2,
      resourceTokenCount: 2,
      unresolvedResourceTokenCount: 0,
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({ image: 'P1' }),
            }),
            expect.objectContaining({
              cells: expect.objectContaining({ image: 'P1 P2' }),
            }),
          ],
          tableProfile: 'storyboard',
          resources: [
            expect.objectContaining({ token: 'P1', status: 'bound' }),
            expect.objectContaining({ token: 'P2', status: 'bound' }),
          ],
        }),
      }),
      'table.basic',
    );
  });

  it('treats panel hints as shot placement metadata instead of separate resource tokens', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1#panel_1 | establish panel | review |',
          '| Opening | 2 | P1#panel_2 | close-up panel | review |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.diagnostics).toEqual([]);
    expect(result.preview).toMatchObject({
      rowCount: 2,
      resourceTokenCount: 1,
      unresolvedResourceTokenCount: 0,
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({ image: 'P1#panel_1' }),
            }),
            expect.objectContaining({
              cells: expect.objectContaining({ image: 'P1#panel_2' }),
            }),
          ],
          tableProfile: 'storyboard',
          resources: [expect.objectContaining({ token: 'P1', status: 'bound' })],
        }),
      }),
      'table.basic',
    );
  });

  it('does not bind CommonMark image alt text as a separate resource token', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createTableFromMarkdown',
        markdown: [
          '| Scene | Image | Prompt |',
          '| --- | --- | --- |',
          '| Opening | ![cover](assets/P1.png) | establish panel |',
        ].join('\n'),
        resources: [
          {
            ...createResource('P1'),
            sourcePath: 'assets/P1.png',
          },
        ],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.diagnostics).toEqual([]);
    expect(result.preview).toMatchObject({
      resourceTokenCount: 1,
      unresolvedResourceTokenCount: 0,
    });
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          resources: [expect.objectContaining({ token: 'assets/P1.png', status: 'bound' })],
        }),
      }),
      'table.basic',
    );
  });

  it('keeps scene grouping hints and extra columns as review metadata', async () => {
    const operations = createOperations();
    await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| Scene | Shot | Image | Prompt | Beat Group | Execution Status |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | establish panel | A | planned |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          tableProfile: 'storyboard',
          rows: [
            expect.objectContaining({
              cells: expect.objectContaining({
                scene: 'Opening',
                'beat-group': 'A',
                'execution-status': 'planned',
              }),
            }),
          ],
        }),
      }),
      'table.basic',
    );
  });

  it('uses storyboard profile aliases for Chinese and variant headers', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| 场景 | 镜号 | 画面描述 | 生成提示词 | 场景视频提示词 | 镜头运动 | 时长秒 | 角色 | 台词 |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          '| 夜市 | S01 | 灯牌下的远景 | neon market | 场景视频生成：灯牌下慢速推进，角色穿过夜市 | 推进 | 4s | Mika、Ren | 走吧 |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('created');
    const payload = readStoryboardPayload(operations);
    const shot = readFirstStoryboardShot(payload);
    expect(payload.scenes[0]?.sceneTitle).toBe('夜市');
    expect(payload.scenes[0]?.storyboardPrompt).toMatchObject({
      promptBlocks: expect.objectContaining({
        videoPromptDocument: expect.objectContaining({
          text: '场景视频生成：灯牌下慢速推进，角色穿过夜市',
          fieldProjections: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'scene.videoPrompt' }),
          ]),
        }),
      }),
    });
    expect(shot).toMatchObject({
      shotNumber: 1,
      duration: 4,
      visualDescription: '灯牌下的远景',
      storyboardPrompt: expect.objectContaining({
        promptBlocks: expect.objectContaining({
          imagePromptDocument: expect.objectContaining({ text: 'neon market' }),
          voicePromptDocument: expect.objectContaining({ text: '走吧' }),
        }),
        generationParams: expect.objectContaining({
          duration: 4,
          dialogue: '走吧',
        }),
      }),
      cameraMovement: 'zoom-in',
      characters: [{ characterName: 'Mika' }, { characterName: 'Ren' }],
      dialogue: '走吧',
      sceneTags: ['夜市'],
    });
    expect(shot.storyboardPrompt?.promptBlocks?.videoPromptDocument).toBeUndefined();
    expect(shot).not.toHaveProperty('generationPrompt');
  });

  it('does not create production shot nodes for skip, reference-only, or duplicate rows', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| scene | shot | source | decision | visual | imagePrompt |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | reference-only | cover style reference | cover keyframe |',
          '| Opening | 2 | P2 | skip | metadata page | metadata keyframe |',
          '| Opening | 3 | P3 | duplicate | repeated panel | repeated keyframe |',
          '| Opening | 4 | P4 | keep | corridor shot | corridor keyframe |',
        ].join('\n'),
        resources: [
          createResource('P1'),
          createResource('P2'),
          createResource('P3'),
          createResource('P4'),
        ],
      },
      operations,
    );

    expect(result.status).toBe('created');
    const payload = readStoryboardPayload(operations);
    expect(payload.scenes[0]?.shotPlans).toHaveLength(1);
    const shot = readFirstStoryboardShot(payload);
    expect(shot).toMatchObject({
      shotNumber: 4,
      visualDescription: 'corridor shot',
      storyboardPrompt: expect.objectContaining({
        promptBlocks: expect.objectContaining({
          imagePromptDocument: expect.objectContaining({ text: 'corridor keyframe' }),
        }),
      }),
    });
    expect(shot.storyboardPrompt?.promptBlocks?.videoPromptDocument).toBeUndefined();
    expect(shot).not.toHaveProperty('generationPrompt');
  });

  it('blocks production creation when every storyboard row is non-production', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| scene | shot | decision | visual | imagePrompt |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | reference-only | cover style reference | cover keyframe |',
          '| Opening | 2 | skip | metadata page | metadata keyframe |',
          '| Opening | 3 | duplicate | repeated panel | repeated keyframe |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-storyboard-profile-no-production-rows',
      }),
    ]);
    expect(operations.createStoryboard).not.toHaveBeenCalled();
  });

  it('creates semantic prompt documents instead of shot prompt slots during production node creation', async () => {
    const operations = createOperations();
    await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| scene | shot | visual | imagePrompt | prompt | videoPrompt |',
          '| --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | corridor | image generation: keyframe prompt | legacy prompt | video generation: slow dolly |',
        ].join('\n'),
      },
      operations,
    );

    const payload = readStoryboardPayload(operations);
    expect(payload.scenes[0]?.storyboardPrompt).toMatchObject({
      promptBlocks: expect.objectContaining({
        videoPromptDocument: expect.objectContaining({
          text: 'video generation: slow dolly',
          fieldProjections: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'scene.videoPrompt' }),
          ]),
        }),
      }),
    });
    const shot = readFirstStoryboardShot(payload);
    expect(shot).toMatchObject({
      storyboardPrompt: expect.objectContaining({
        promptBlocks: expect.objectContaining({
          imagePromptDocument: expect.objectContaining({
            text: 'image generation: keyframe prompt',
          }),
        }),
        nextCreativeState: expect.objectContaining({
          id: 'image-prompt-ready',
          nextActionId: 'generate-image',
        }),
      }),
    });
    expect(shot.storyboardPrompt?.promptBlocks?.videoPromptDocument).toBeUndefined();
    expect(shot).not.toHaveProperty('generationPrompt');
    expect(shot).not.toHaveProperty('promptSlots');
  });

  it('keeps scene operation hints in semantic prompt documents without legacy scene prompt slots', async () => {
    const operations = createOperations();
    await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        operationHint: 'video.scene.generate',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| scene | shot | visual | videoPrompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | corridor | generate one continuous scene video across this beat |',
        ].join('\n'),
      },
      operations,
    );

    const payload = readStoryboardPayload(operations);
    expect(payload.scenes[0]?.storyboardPrompt).toMatchObject({
      promptBlocks: expect.objectContaining({
        videoPromptDocument: expect.objectContaining({
          text: 'generate one continuous scene video across this beat',
          fieldProjections: expect.arrayContaining([
            expect.objectContaining({ fieldId: 'scene.videoPrompt' }),
          ]),
        }),
      }),
    });
    const shot = readFirstStoryboardShot(payload);
    expect(shot).not.toHaveProperty('promptSlots');
    expect(shot.storyboardPrompt?.promptBlocks?.videoPromptDocument).toBeUndefined();
  });

  it('does not derive scene video prompts from image prompt fallback columns', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| scene | shot | imagePrompt |',
          '| --- | --- | --- |',
          '| Opening | 1 | edit image: remove lettering from source panel |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('created');
    const shot = readFirstStoryboardShot(readStoryboardPayload(operations));
    expect(shot).toMatchObject({
      visualDescription: 'edit image: remove lettering from source panel',
      storyboardPrompt: expect.objectContaining({
        promptBlocks: expect.objectContaining({
          imagePromptDocument: expect.objectContaining({
            text: 'edit image: remove lettering from source panel',
          }),
        }),
      }),
    });
    expect(shot.storyboardPrompt?.promptBlocks?.videoPromptDocument).toBeUndefined();
    expect(shot).not.toHaveProperty('generationPrompt');
  });

  it('does not let generationPrompt-like Markdown columns recreate legacy prompt authority', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| scene | shot | visual | Generation Prompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | rain corridor | legacy-looking prompt text |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('created');
    const shot = readFirstStoryboardShot(readStoryboardPayload(operations));
    expect(shot).not.toHaveProperty('generationPrompt');
    expect(shot).toMatchObject({
      storyboardPrompt: expect.objectContaining({
        promptBlocks: expect.objectContaining({
          imagePromptDocument: expect.objectContaining({
            text: 'legacy-looking prompt text',
          }),
        }),
      }),
    });
    expect(shot.storyboardPrompt?.promptBlocks?.videoPromptDocument).toBeUndefined();
  });

  it('rejects unsupported storyboard table profile hints visibly', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        profileHint: 'canvas.tableProfile.interactive-branch-map',
        markdown: STORYBOARD_MARKDOWN,
      },
      operations,
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-unsupported-table-profile',
        fieldKey: 'profileHint',
      }),
    ]);
    expect(operations.createNode).not.toHaveBeenCalled();
  });

  it('blocks production creation when operation hints conflict with a non-creative profile hint', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        operationHint: 'video.scene.generate',
        profileHint: 'generic',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| scene | shot | visual | videoPrompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | wide reveal | slow scene journey |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-operation-profile-mismatch',
        fieldKey: 'operationHint',
      }),
    ]);
    expect(operations.createStoryboard).not.toHaveBeenCalled();
  });

  it('keeps generic tables generic even when they contain storyboard-like columns', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createTableFromMarkdown',
        markdown: [
          '| Scene | Shot | Image | Prompt | Approval |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | neon door | pending |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('created');
    expect(result.actions).toBeUndefined();
    expect(operations.createStoryboard).not.toHaveBeenCalled();
    expect(operations.createNode).toHaveBeenCalledWith(
      'table',
      { x: 0, y: 0 },
      expect.objectContaining({
        markdown: expect.objectContaining({
          tableProfile: 'generic',
          reviewKind: 'generic-table',
          unknownColumns: expect.arrayContaining([
            expect.objectContaining({ id: 'scene' }),
            expect.objectContaining({ id: 'shot' }),
            expect.objectContaining({ id: 'prompt' }),
            expect.objectContaining({ id: 'approval' }),
          ]),
        }),
      }),
      'table.basic',
    );
  });

  it('keeps review tables reviewable when visual is missing but blocks production creation', async () => {
    const operations = createOperations();
    const review = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| Scene | Shot | Image | Next Action |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | P1 | review |',
        ].join('\n'),
        resources: [createResource('P1')],
      },
      operations,
    );

    expect(review.status).toBe('needs-review');
    expect(review.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'canvas-storyboard-profile-visual-or-prompt-missing',
    );

    const production = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| Scene | Shot | Image | Next Action |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | P1 | create |',
        ].join('\n'),
      },
      operations,
    );

    expect(production.status).toBe('blocked');
    expect(production.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'canvas-storyboard-profile-visual-column-required',
      'canvas-markdown-missing-resource-token',
    ]);
  });

  it('blocks operation-targeted production creation when required fields are missing', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        operationHint: 'video.scene.generate',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-1',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| scene | shot | visual | imagePrompt |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | wide reveal | keyframe only |',
        ].join('\n'),
      },
      operations,
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-operation-required-field-missing',
        fieldKey: 'videoPrompt',
      }),
    ]);
    expect(operations.createStoryboard).not.toHaveBeenCalled();
  });

  it('reports ambiguous resource tokens with safe candidate summaries', async () => {
    const operations = createOperations();
    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.ingestMarkdown',
        intentHint: 'creative-table',
        profileHint: 'storyboard',
        markdown: [
          '| Scene | Shot | Image | Prompt | Next Action |',
          '| --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | establish panel | review |',
        ].join('\n'),
        resources: [createResource('P1'), createResource('P1')],
      },
      operations,
    );

    expect(result.status).toBe('needs-review');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'canvas-markdown-ambiguous-resource-token',
        token: 'P1',
        candidates: [
          expect.objectContaining({ token: 'P1', label: 'Page 1' }),
          expect.objectContaining({ token: 'P1', label: 'Page 1' }),
        ],
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain('filePath');
    expect(JSON.stringify(result.diagnostics)).not.toContain('${MEDIA}');
  });

  it('creates Canvas scene and shot plans directly from canonical Storyboard without parsing Markdown', async () => {
    const operations = createOperations();
    const canonicalStoryboard = createCanonicalStoryboard();

    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-canonical',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: 'poison: canonical storyboard must not use Markdown parsing',
        canonicalStoryboard,
      },
      operations,
    );

    expect(result).toMatchObject({
      status: 'created',
      nodeIds: ['scene-1', 'shot-1', 'shot-2', 'scene-2', 'shot-3'],
      preview: { title: 'Canonical Storyboard', rowCount: 3 },
    });
    expect(operations.createStoryboard).toHaveBeenCalledTimes(1);
    const payload = readStoryboardPayload(operations);
    expect(payload).toMatchObject({
      sourceStoryboardRevisionId: 'storyboard-rev-1',
      projectionMode: 'read-only-projection',
      scenes: [
        {
          sceneId: 'scene-1',
          storyboardPrompt: {
            promptBlocks: {
              videoPromptDocument: expect.objectContaining({
                blockKind: 'video',
                text: 'cat crosses the hallway',
                baseRevision: 'storyboard-rev-1',
              }),
            },
          },
          shotPlans: [
            {
              shotId: 'shot-1',
              imagePrompt: 'cat hallway keyframe',
              sourceMediaRefs: [
                expect.objectContaining({
                  refId: 'source-image-1',
                  resourceRef: expect.objectContaining({ id: 'source-image-resource' }),
                }),
              ],
            },
            {
              shotId: 'shot-2',
              referenceImageResourceRef: expect.objectContaining({
                kind: 'document-entry',
                entryPath: 'pages/page-002.png',
              }),
            },
          ],
        },
        {
          sceneId: 'scene-2',
          shotPlans: [
            {
              shotId: 'shot-3',
              referenceResourceRef: expect.objectContaining({ id: 'generated-image-resource' }),
              generatedMediaRefs: [
                expect.objectContaining({ refId: 'generated-image-3', mimeType: 'image/png' }),
              ],
            },
          ],
        },
      ],
    });
    expect(payload.scenes[0]?.shotPlans[0]).not.toHaveProperty('videoPrompt');
    expect(
      payload.scenes[0]?.shotPlans[0]?.storyboardPrompt?.promptBlocks?.videoPromptDocument,
    ).toBeUndefined();
  });

  it('blocks flat canonical Storyboard rows without reconstructing scenes from Markdown', async () => {
    const operations = createOperations();
    const canonicalStoryboard = createCanonicalStoryboard();
    const shot = canonicalStoryboard.scenes[0]!.shots[0]!;

    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-flat-canonical',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| Scene | Shot | Visual |',
          '| --- | --- | --- |',
          '| fallback | 1 | must not be parsed |',
        ].join('\n'),
        canonicalStoryboard: {
          ...canonicalStoryboard,
          scenes: [
            {
              ...shot,
              sceneId: 'scene-1',
              sceneTitle: 'Opening',
            },
          ],
        } as never,
      },
      operations,
    );

    expect(result).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'canonical-scene-shot-hierarchy-required' })],
    });
    expect(operations.createStoryboard).not.toHaveBeenCalled();
  });

  it('blocks invalid canonical Storyboard media refs without falling back to parseable Markdown', async () => {
    const operations = createOperations();
    const canonicalStoryboard = createCanonicalStoryboard();
    const firstScene = canonicalStoryboard.scenes[0]!;
    const firstShot = firstScene.shots[0]!;
    const invalidStoryboard: StoryboardTable = {
      ...canonicalStoryboard,
      scenes: [
        {
          ...firstScene,
          shots: [
            {
              ...firstShot,
              sourceMediaRefs: [
                {
                  refId: 'runtime-cache-image',
                  role: 'source',
                  locator: { type: 'workspace-path', path: '/tmp/neko-cache/panel.png' },
                },
              ],
            },
            ...firstScene.shots.slice(1),
          ],
        },
        ...canonicalStoryboard.scenes.slice(1),
      ],
    };

    const result = await invokeCanvasMarkdownCapability(
      {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        mode: 'create-nodes',
        approval: {
          source: 'creation-apply',
          creationId: 'creation-invalid-canonical',
          iterationId: 'iteration-1',
          profileId: 'idc.default',
          stageId: 'apply',
        },
        markdown: [
          '| Scene | Shot | Visual |',
          '| --- | --- | --- |',
          '| fallback | 1 | must not be parsed |',
        ].join('\n'),
        canonicalStoryboard: invalidStoryboard,
      },
      operations,
    );

    expect(result.status).toBe('blocked');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: 'error' })]),
    );
    expect(operations.createStoryboard).not.toHaveBeenCalled();
  });
});

function createCanonicalStoryboard(): StoryboardTable {
  const sourceResource = createResourceRef({
    id: 'story-source-resource',
    scope: 'project',
    provider: 'workspace',
    kind: 'document',
    source: { kind: 'file', projectRelativePath: 'scripts/story.md' },
    locator: { kind: 'file', path: '${WORKSPACE}/scripts/story.md' },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'story-source' }),
  });
  const imageResource = createResourceRef({
    id: 'source-image-resource',
    scope: 'project',
    provider: 'workspace',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: 'assets/cat.png' },
    locator: { kind: 'file', path: '${WORKSPACE}/assets/cat.png' },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'cat-source' }),
  });
  const generatedImageResource = createResourceRef({
    id: 'generated-image-resource',
    scope: 'project',
    provider: 'workspace',
    kind: 'media',
    source: { kind: 'file', projectRelativePath: 'generated/cat-roll.png' },
    locator: { kind: 'file', path: '${WORKSPACE}/generated/cat-roll.png' },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'cat-generated' }),
  });
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    contractVersion: 1,
    sourceProfile: 'from-script',
    revision: {
      revisionId: 'storyboard-rev-1',
      sequence: 1,
      contentDigest: 'storyboard-rev-1',
      createdAt: '2026-07-12T00:00:00.000Z',
    },
    sourceTrace: [{ traceId: 'trace-1', sourceProfile: 'from-script', sourceRef: sourceResource }],
    title: 'Canonical Storyboard',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Hallway',
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'A cat enters.',
            characterAction: 'The cat walks.',
            imageStrategy: 'use-as-reference',
            imagePrompt: 'cat hallway keyframe',
            videoPrompt: 'cat crosses the hallway',
            sourceMediaRefs: [
              {
                refId: 'source-image-1',
                role: 'source',
                locator: { type: 'workspace-path', path: '${WORKSPACE}/assets/cat.png' },
                resourceRef: imageResource,
              },
            ],
          },
          {
            shotId: 'shot-2',
            shotNumber: 2,
            duration: 2,
            visualDescription: 'The cat jumps.',
            characterAction: 'The cat bats a toy.',
            imageStrategy: 'generate-new',
            imagePrompt: 'cat jumping keyframe',
            sourceMediaRefs: [
              {
                refId: 'document-page-2',
                role: 'reference',
                locator: { type: 'workspace-path', path: '${WORKSPACE}/books/pages/page-002.png' },
                documentResourceRef: {
                  kind: 'document-entry',
                  source: {
                    filePath: '${WORKSPACE}/books/comic.cbz',
                    format: 'cbz',
                  },
                  entryPath: 'pages/page-002.png',
                },
              },
            ],
          },
        ],
      },
      {
        sceneId: 'scene-2',
        sceneTitle: 'Living Room',
        shots: [
          {
            shotId: 'shot-3',
            shotNumber: 1,
            duration: 4,
            visualDescription: 'The cat lands.',
            characterAction: 'The cat rolls over.',
            imageStrategy: 'generate-new',
            imagePrompt: 'cat rolling keyframe',
            generatedMediaRefs: [
              {
                refId: 'generated-image-3',
                role: 'generated',
                locator: { type: 'workspace-path', path: '${WORKSPACE}/generated/cat-roll.png' },
                mimeType: 'image/png',
                resourceRef: generatedImageResource,
              },
            ],
          },
        ],
      },
    ],
  };
}

const STORYBOARD_MARKDOWN = [
  '| Scene | Shot | Visual | Prompt | Video Prompt | Duration | Character | Next Action |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  '| Opening | 1 | Wide view | cinematic wide prompt | scene video: wide view establishes the room, then cut to close-up | 2.5s | Mika | create |',
  '| Opening | 2 | Close-up | close prompt |  | 0s | Mika | create |',
].join('\n');

function createOperations(): CanvasMarkdownCapabilityOperations {
  return {
    applyAgentContent: vi.fn(async () => ({
      changed: true,
      mode: 'insert',
      nodeId: 'note-1',
      createdNodeIds: ['note-1'],
    })),
    createNode: vi.fn(async () => 'table-1'),
    updateNode: vi.fn(async () => undefined),
    createComposite: vi.fn(async () => ({
      containerId: 'scene-1',
      childIds: ['shot-1', 'shot-2'],
    })),
    createStoryboard: vi.fn(async (payload: CanvasStoryboardPayload) => {
      let nextShotId = 1;
      return {
        mode: payload.mode,
        scenesCreated: payload.scenes.length,
        totalShots: payload.scenes.reduce((total, scene) => total + scene.shotPlans.length, 0),
        documentUri: 'file:///workspace/Storyboard.nkc',
        scenes: payload.scenes.map((scene, sceneIndex) => ({
          sourceSceneId: scene.sceneId,
          sceneNodeId: `scene-${sceneIndex + 1}`,
          shotIds: scene.shotPlans.map(() => `shot-${nextShotId++}`),
        })),
      };
    }),
  };
}

function readStoryboardPayload(
  operations: CanvasMarkdownCapabilityOperations,
): CanvasStoryboardPayload {
  const payload = vi.mocked(operations.createStoryboard).mock.calls[0]?.[0];
  if (!payload) {
    throw new Error('Expected createStoryboard to be called');
  }
  return payload;
}

function readFirstStoryboardShot(
  payload: CanvasStoryboardPayload,
): CanvasStoryboardPayload['scenes'][number]['shotPlans'][number] {
  const shot = payload.scenes[0]?.shotPlans[0];
  if (!shot) {
    throw new Error('Expected storyboard payload to contain a first shot');
  }
  return shot;
}

function createResource(token: string): CanvasMarkdownResourceRef {
  return {
    token,
    label: `Page ${token.slice(1)}`,
    role: 'source',
    resourceRef: createTestResourceRef(token),
  };
}

function createTestResourceRef(token: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: {
      kind: 'file',
      filePath: `\${MEDIA}/${token}.png`,
      projectRelativePath: `assets/${token}.png`,
    },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: token }),
  });
}
