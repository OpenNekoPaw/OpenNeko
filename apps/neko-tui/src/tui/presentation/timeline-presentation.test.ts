import { describe, expect, it } from 'vitest';
import type { TerminalTimelineRow } from '../types/state';
import { createTestAgentTerminalPresentation } from './testing';
import { presentTimelineFailure, presentTimelineProcessLabel } from './timeline-presentation';

function row(overrides: Partial<TerminalTimelineRow>): TerminalTimelineRow {
  return {
    id: 'row-1',
    sequence: 1,
    kind: 'tool',
    status: 'running',
    timestamp: 1,
    ...overrides,
  };
}

describe('timeline presentation', () => {
  it('localizes only Neko-owned fallback labels', () => {
    const zh = createTestAgentTerminalPresentation('zh-cn');

    expect(presentTimelineProcessLabel(row({ kind: 'tool' }), zh)).toBe('工具');
    expect(presentTimelineProcessLabel(row({ kind: 'task' }), zh)).toBe('任务');
    expect(presentTimelineProcessLabel(row({ kind: 'media' }), zh)).toBe('媒体任务');
  });

  it('preserves external names, identifiers, and failure details across locales', () => {
    const en = createTestAgentTerminalPresentation('en');
    const zh = createTestAgentTerminalPresentation('zh-cn');
    const tool = row({ kind: 'tool', toolName: 'VendorSearch' });
    const task = row({ kind: 'task', taskId: 'task-stable-1' });
    const failure = row({ kind: 'error', content: 'Provider detail: quota_exceeded' });

    expect(presentTimelineProcessLabel(tool, en)).toBe('VendorSearch');
    expect(presentTimelineProcessLabel(tool, zh)).toBe('VendorSearch');
    expect(presentTimelineProcessLabel(task, en)).toBe('task-stable-1');
    expect(presentTimelineProcessLabel(task, zh)).toBe('task-stable-1');
    expect(presentTimelineFailure(failure, en)).toBe('Provider detail: quota_exceeded');
    expect(presentTimelineFailure(failure, zh)).toBe('Provider detail: quota_exceeded');
  });

  it('localizes owned failures while preserving protocol tokens', () => {
    const en = createTestAgentTerminalPresentation('en');
    const zh = createTestAgentTerminalPresentation('zh-cn');

    expect(presentTimelineFailure(row({ kind: 'error' }), en)).toBe('Timeline error');
    expect(presentTimelineFailure(row({ kind: 'error' }), zh)).toBe('时间线错误');
    expect(
      presentTimelineFailure(
        row({ kind: 'diagnostic', diagnosticCode: 'unknown-tool-result-anchor' }),
        zh,
      ),
    ).toBe('tool_result 事件引用了未知工具。');
  });

  it('fails visibly for missing or unsupported owned diagnostic codes', () => {
    const en = createTestAgentTerminalPresentation('en');

    expect(() => presentTimelineFailure(row({ kind: 'diagnostic' }), en)).toThrow(
      'Owned timeline diagnostic is missing diagnosticCode.',
    );
    expect(() =>
      presentTimelineFailure(
        row({ kind: 'diagnostic', diagnosticCode: 'future-unsupported-code' }),
        en,
      ),
    ).toThrow('Unsupported owned timeline diagnostic code: future-unsupported-code');
  });
});
