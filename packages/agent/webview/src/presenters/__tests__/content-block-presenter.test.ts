import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '@neko/agent-contracts';
import { projectAssistantTurn, projectContentBlocksUi } from '../content-block-presenter';

describe('content block presenter', () => {
  it('aggregates consecutive successful tool calls with the same tool and target', () => {
    const projections = projectContentBlocksUi([
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
      toolBlock('tool-2', 'ReadDocument', '/books/a.epub', 14),
      toolBlock('tool-3', 'ReadDocument', '/books/a.epub', 18),
    ]);

    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      renderKind: 'toolGroup',
      toolName: 'ReadDocument',
      count: 3,
      successCount: 3,
      failureCount: 0,
      pendingCount: 0,
      targetLabel: '/books/a.epub',
      durationLabel: '10-18ms',
    });
  });

  it('keeps different targets separate and compacts completed calls for one target', () => {
    const projections = projectContentBlocksUi([
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
      toolBlock('tool-2', 'ReadDocument', '/books/b.epub', 12),
      toolBlock('tool-3', 'ReadDocument', '/books/b.epub', 14, false),
    ]);

    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({ renderKind: 'tool' });
    expect(projections[1]).toMatchObject({
      renderKind: 'toolGroup',
      count: 2,
      successCount: 1,
      failureCount: 1,
      targetLabel: '/books/b.epub',
    });
  });

  it('aggregates tools by typed target without tool-name visibility exceptions', () => {
    const projections = projectContentBlocksUi([
      toolBlock('tool-1', 'ReadImage', '/tmp/page-1.jpg', 10),
      toolBlock('tool-2', 'ReadImage', '/tmp/page-1.jpg', 12),
    ]);

    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({ renderKind: 'toolGroup', count: 2 });
  });

  it('passes sibling tool calls through markdown projections for transfer binding', () => {
    const blocks: ContentBlock[] = [
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
      {
        id: 'block-text',
        type: 'text',
        timestamp: 20,
        content: '| 镜头 | 原页 | 画面 |\n| --- | --- | --- |\n| S1 | P1 | 标题页 |',
      },
    ];

    const projections = projectContentBlocksUi(blocks, false, blocks);
    const markdown = projections.find((projection) => projection.renderKind === 'markdown');

    expect(markdown).toMatchObject({
      renderKind: 'markdown',
      siblingBlocks: blocks,
      toolCalls: [blocks[0]?.toolCall],
    });
  });

  it('renders typed composites independently from ordinary Markdown code fences', () => {
    const blocks: ContentBlock[] = [
      {
        id: 'block-text',
        type: 'text',
        timestamp: 20,
        content: '```neko-composite\n{}\n```',
      },
      {
        id: 'block-text-composite-1',
        type: 'composite',
        timestamp: 20,
        composite: { template: 'report', sections: [{ heading: 'Projected' }] },
      },
    ];

    const projections = projectContentBlocksUi(blocks, false, blocks);

    expect(projections).toHaveLength(2);
    expect(projections[0]).toMatchObject({ renderKind: 'markdown', siblingBlocks: blocks });
    expect(projections[1]).toMatchObject({ renderKind: 'composite' });
  });

  it('does not mark completed text blocks as streaming while the parent message is still processing', () => {
    const projections = projectContentBlocksUi(
      [
        {
          id: 'block-text',
          type: 'text',
          timestamp: 20,
          content: '已提交猫猫玩耍图片生成任务，正在后台处理。',
          isStreaming: false,
        },
      ],
      true,
    );

    expect(projections[0]).toMatchObject({
      renderKind: 'markdown',
      renderStreaming: false,
    });
  });

  it('projects one answer and one activity collection for a completed turn', () => {
    const projections = projectContentBlocksUi([
      {
        id: 'block-thinking',
        type: 'thinking',
        timestamp: 8,
        thinking: 'Inspect source.',
        isThinkingComplete: true,
      },
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
      {
        id: 'block-text',
        type: 'text',
        timestamp: 20,
        content: 'Summary.',
      },
    ]);

    const turn = projectAssistantTurn(projections, { startedAt: 8, completedAt: 20 });

    expect(turn.activitySummary).toMatchObject({
      blockCount: 2,
      toolCallCount: 1,
      thinkingCount: 1,
      isRunning: false,
      startedAt: 8,
      completedAt: 20,
    });
    expect(turn.activity.map((projection) => projection.renderKind)).toEqual(['thinking', 'tool']);
    expect(turn.answer).toEqual([
      expect.objectContaining({
        renderKind: 'markdown',
        content: 'Summary.',
      }),
    ]);
  });

  it('keeps Turn timing independent from overlapping Tool duration totals', () => {
    const projections = projectContentBlocksUi([
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 90_000),
      toolBlock('tool-2', 'ReadImage', '/books/page.png', 90_000),
      { id: 'answer', type: 'text', timestamp: 149_000, content: 'Done.' },
    ]);

    const turn = projectAssistantTurn(projections, {
      startedAt: 1_000,
      completedAt: 149_000,
    });

    expect(turn.activitySummary).toMatchObject({
      startedAt: 1_000,
      completedAt: 149_000,
      toolCallCount: 2,
    });
  });

  it('moves text before a later tool into activity and keeps only terminal text as answer', () => {
    const projections = projectContentBlocksUi([
      { id: 'text-progress', type: 'text', timestamp: 1, content: 'I will inspect the file.' },
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
      { id: 'text-answer', type: 'text', timestamp: 20, content: 'Final answer.' },
    ]);

    const turn = projectAssistantTurn(projections);

    expect(turn.activity).toEqual([
      expect.objectContaining({ renderKind: 'markdown', content: 'I will inspect the file.' }),
      expect.objectContaining({ renderKind: 'tool' }),
    ]);
    expect(turn.answer).toEqual([
      expect.objectContaining({ renderKind: 'markdown', content: 'Final answer.' }),
    ]);
  });

  it('keeps failed tools actionable instead of hiding them in activity', () => {
    const projections = projectContentBlocksUi([
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10, false),
      { id: 'text-answer', type: 'text', timestamp: 20, content: 'Could not read the file.' },
    ]);

    const turn = projectAssistantTurn(projections);

    expect(turn.actionable).toEqual([expect.objectContaining({ renderKind: 'tool' })]);
    expect(turn.activity).toEqual([]);
    expect(turn.answer).toHaveLength(1);
  });

  it('compacts repeated failed calls for the same exact target into one actionable group', () => {
    const projections = projectContentBlocksUi([
      failedToolBlock('failed-1', 'ReadDocument', 'cursor_12b95yb', 10),
      failedToolBlock('failed-2', 'ReadDocument', 'cursor_12b95yb', 20),
    ]);

    const turn = projectAssistantTurn(projections, { startedAt: 1, completedAt: 21 });

    expect(turn.actionable).toEqual([
      expect.objectContaining({
        renderKind: 'toolGroup',
        count: 2,
        failureCount: 2,
        targetLabel: 'cursor_12b95yb',
      }),
    ]);
    expect(turn.activity).toEqual([]);
  });

  it('keeps generated attachments as deliverables and read evidence in activity', () => {
    const evidence = toolBlock('tool-evidence', 'ReadImage', '/books/page-1.png', 10);
    if (!evidence.toolCall?.result) throw new Error('Expected evidence Tool result.');
    evidence.toolCall.result.attachments = [{ type: 'image', path: 'page-1.png' }];
    evidence.toolCall.result.perceptionCards = [
      {
        assetId: 'page-1',
        modality: 'image',
        createdAt: 10,
        layerStatus: { layer0: 'complete', layer1: 'complete', layer2: 'skipped' },
        structural: { format: 'png', mimeType: 'image/png', byteSize: 1 },
      },
    ];
    const generated = toolBlock('tool-output', 'GenerateImage', '/output/cat.png', 20);
    if (!generated.toolCall?.result) throw new Error('Expected generated Tool result.');
    generated.toolCall.result.attachments = [{ type: 'image', path: 'cat.png' }];

    const turn = projectAssistantTurn(projectContentBlocksUi([evidence, generated]));

    expect(turn.activity).toEqual([expect.objectContaining({ renderKind: 'tool' })]);
    expect(turn.deliverables).toEqual([expect.objectContaining({ renderKind: 'tool' })]);
  });

  it('keeps typed document thumbnails in activity without requiring perception cards', () => {
    const evidence = toolBlock('tool-evidence', 'ReadImage', '/books/a.epub', 10);
    if (!evidence.toolCall?.result) throw new Error('Expected evidence Tool result.');
    evidence.toolCall.result.data = {
      source: { filePath: '/books/a.epub', format: 'epub' },
      mode: 'metadata',
      images: [
        {
          label: 'Page 1',
          renderUri: 'http://127.0.0.1:43125/resources/page-1.jpg',
          width: 1494,
          height: 2133,
          byteSize: 2048,
          mimeType: 'image/jpeg',
          metadata: {
            documentIndex: 1,
            locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 1 },
          },
          contentLocator: {
            kind: 'document-entry',
            source: { kind: 'workspace-file', path: 'books/a.epub' },
            entryPath: 'image/Page_1.jpg',
          },
        },
      ],
      imageCount: 1,
    };
    evidence.toolCall.result.attachments = [{ type: 'image', path: 'page-1.jpg' }];

    const turn = projectAssistantTurn(projectContentBlocksUi([evidence]));

    expect(turn.activity).toEqual([expect.objectContaining({ renderKind: 'tool' })]);
    expect(turn.deliverables).toEqual([]);
  });

  it('keeps completed progress inside activity until a streaming answer block exists', () => {
    const progressOnly = projectContentBlocksUi(
      [{ id: 'text-progress', type: 'text', timestamp: 1, content: 'Still working.' }],
      true,
    );
    const activeAnswer = projectContentBlocksUi(
      [
        {
          id: 'text-answer',
          type: 'text',
          timestamp: 2,
          content: 'Streaming answer',
          isStreaming: true,
        },
      ],
      true,
    );

    expect(projectAssistantTurn(progressOnly).activity).toHaveLength(1);
    expect(projectAssistantTurn(progressOnly).answer).toHaveLength(0);
    expect(projectAssistantTurn(activeAnswer).answer).toHaveLength(1);
  });
});

function toolBlock(
  id: string,
  name: string,
  filePath: string,
  duration: number,
  success = true,
): ContentBlock {
  return {
    id: `block-${id}`,
    type: 'tool_call',
    timestamp: duration,
    toolCall: {
      id,
      name,
      arguments: { file_path: filePath },
      result: {
        success,
        data: { file_path: filePath },
        duration,
      },
    },
  };
}

function failedToolBlock(
  id: string,
  name: string,
  cursorRef: string,
  timestamp: number,
): ContentBlock {
  return {
    id: `block-${id}`,
    type: 'tool_call',
    timestamp,
    toolCall: {
      id,
      name,
      arguments: { cursor_ref: cursorRef },
      result: {
        success: false,
        data: null,
        error: 'Document content could not be read.',
      },
    },
  };
}
