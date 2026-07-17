import { describe, expect, it } from 'vitest';
import { createTestAgentTerminalPresentation } from './testing';
import { presentSessionControlCommand } from './session-control-presentation';

describe('presentSessionControlCommand', () => {
  it('keeps command values stable while localizing semantic session output', () => {
    const en = createTestAgentTerminalPresentation('en');
    const zh = createTestAgentTerminalPresentation('zh-cn');
    const result = {
      kind: 'session-mode-status',
      current: 'video',
      available: ['agent', 'image', 'video', 'audio'],
    } as const;

    expect(presentSessionControlCommand(result, en)).toEqual({
      kind: 'output',
      output:
        'Session mode: video\nAvailable: agent, image, video, audio\nUsage: /mode agent|image|video|audio',
    });
    expect(presentSessionControlCommand(result, zh)).toEqual({
      kind: 'output',
      output:
        '会话模式：video\n可用模式：agent, image, video, audio\n用法：/mode agent|image|video|audio',
    });
  });

  it('localizes diagnostics without translating the rejected value', () => {
    const result = {
      kind: 'diagnostic',
      code: 'session-mode-unsupported',
      value: 'cinema',
      available: ['agent', 'image', 'video', 'audio'],
    } as const;

    expect(
      presentSessionControlCommand(result, createTestAgentTerminalPresentation('zh-cn')),
    ).toEqual({
      kind: 'error',
      diagnosticCode: 'session-mode.unsupported',
      error: '不支持的会话模式：cinema。有效值：agent, image, video, audio',
    });
  });

  it('formats compact counts through the invocation presentation context', () => {
    expect(
      presentSessionControlCommand(
        {
          kind: 'context-compacted',
          originalTokens: 12000,
          compressedTokens: 3000,
          ratio: 0.25,
        },
        createTestAgentTerminalPresentation('en'),
      ),
    ).toEqual({
      kind: 'output',
      output: 'Context compressed: 12,000 -> 3,000 tokens (25.0%)',
    });
  });
});
