import { describe, expect, it } from 'vitest';
import { createTestAgentTerminalPresentation } from './testing';
import {
  presentGeneratingActivity,
  presentProcessingActivity,
  presentThinkingActivity,
  presentThinkingBlockHeader,
  presentThinkingBlockMoreLines,
} from './activity-presentation';

describe('activity presentation', () => {
  it('presents complete English activity variants', () => {
    const presentation = createTestAgentTerminalPresentation('en');

    expect(presentProcessingActivity({ current: 0, max: 0, elapsedSeconds: 0 }, presentation)).toBe(
      'Processing',
    );
    expect(
      presentProcessingActivity({ current: 3, max: 10, elapsedSeconds: 0 }, presentation),
    ).toBe('Processing (3/10)');
    expect(
      presentProcessingActivity({ current: 3, max: 10, elapsedSeconds: 61 }, presentation),
    ).toBe('Processing (3/10) 1m 1s');
    expect(presentThinkingActivity({ elapsedSeconds: 61 }, presentation)).toBe(
      'Thinking… (thought for 1m 1s)',
    );
    expect(presentGeneratingActivity({ elapsedSeconds: 61 }, presentation)).toBe(
      'Generating 1m 1s',
    );
    expect(presentThinkingBlockHeader({ isThinking: false, lineCount: 1 }, presentation)).toBe(
      '* Thought for 1 line',
    );
    expect(presentThinkingBlockMoreLines(2, presentation)).toBe('... 2 more lines');
  });

  it('localizes Neko-owned activity prose without changing stable iteration values', () => {
    const presentation = createTestAgentTerminalPresentation('zh-cn');

    expect(
      presentProcessingActivity({ current: 3, max: 10, elapsedSeconds: 0 }, presentation),
    ).toBe('处理中（3/10）');
    expect(presentThinkingActivity({ elapsedSeconds: 0 }, presentation)).toBe('思考中…');
    expect(presentGeneratingActivity({ elapsedSeconds: 0 }, presentation)).toBe('生成中');
    expect(presentThinkingBlockHeader({ isThinking: false, lineCount: 2 }, presentation)).toBe(
      '* 已思考 2 行',
    );
    expect(presentThinkingBlockMoreLines(1, presentation)).toBe('... 另有 1 行');
  });
});
