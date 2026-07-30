import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '@neko-agent/types';
import { projectContentBlocksDisplay, projectContentBlocksUi } from '../content-block-presenter';

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

  it('keeps different targets and failures as individual tool rows', () => {
    const projections = projectContentBlocksUi([
      toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
      toolBlock('tool-2', 'ReadDocument', '/books/b.epub', 12),
      toolBlock('tool-3', 'ReadDocument', '/books/b.epub', 14, false),
    ]);

    expect(projections.map((projection) => projection.renderKind)).toEqual([
      'tool',
      'tool',
      'tool',
    ]);
  });

  it('keeps image analysis tools visible as individual rows', () => {
    const projections = projectContentBlocksUi([
      toolBlock('tool-1', 'ReadImage', '/tmp/page-1.jpg', 10),
      toolBlock('tool-2', 'ReadImage', '/tmp/page-1.jpg', 12),
    ]);

    expect(projections.map((projection) => projection.renderKind)).toEqual(['tool', 'tool']);
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

    const projections = projectContentBlocksUi(blocks, false, undefined, blocks);
    const markdown = projections.find((projection) => projection.renderKind === 'markdown');

    expect(markdown).toMatchObject({
      renderKind: 'markdown',
      siblingBlocks: blocks,
      toolCalls: [blocks[0]?.toolCall],
    });
  });

  it('keeps Markdown-derived composites as semantic metadata without standalone rendering', () => {
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
        compositeSource: {
          kind: 'normalized-markdown-code-block',
          sourceBlockId: 'block-text',
          startOffset: 0,
          endOffset: 25,
          language: 'neko-composite',
          candidateIndex: 0,
        },
      },
    ];

    const projections = projectContentBlocksUi(blocks, false, undefined, blocks);

    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({ renderKind: 'markdown', siblingBlocks: blocks });
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

  it('keeps collapsible process records in source order when a primary result exists', () => {
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

    const display = projectContentBlocksDisplay(projections);

    expect(display.items.map((item) => item.kind)).toEqual(['processGroup', 'projection']);
    expect(display.items[0]).toMatchObject({
      kind: 'processGroup',
      processGroup: {
        blockCount: 2,
        toolCallCount: 1,
        thinkingCount: 1,
      },
    });
    expect(display.items[1]).toMatchObject({
      kind: 'projection',
      projection: {
        renderKind: 'markdown',
        content: 'Summary.',
      },
    });
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
