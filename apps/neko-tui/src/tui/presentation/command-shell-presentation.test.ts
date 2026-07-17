import { describe, expect, it } from 'vitest';
import { createTestAgentTerminalPresentation } from './testing';
import { presentCommandShellDiagnostic } from './command-shell-presentation';

describe('command shell presentation', () => {
  it('localizes unknown-command chrome while preserving the original input', () => {
    const input = '/原始-command --flag';
    expect(
      presentCommandShellDiagnostic(
        { kind: 'unknown-command', input },
        createTestAgentTerminalPresentation('en'),
      ),
    ).toEqual({
      kind: 'error',
      diagnosticCode: 'command.unknown',
      error: 'Unknown command: /原始-command --flag. Type /help for available commands.',
    });
    expect(
      presentCommandShellDiagnostic(
        { kind: 'unknown-command', input },
        createTestAgentTerminalPresentation('zh-cn'),
      ),
    ).toEqual({
      kind: 'error',
      diagnosticCode: 'command.unknown',
      error: '未知命令：/原始-command --flag。输入 /help 查看可用命令。',
    });
  });

  it('preserves unexpected external details under localized wrappers', () => {
    const detail = 'EPIPE: /external/路径';
    const zh = presentCommandShellDiagnostic(
      { kind: 'skill-invocation-failed', detail },
      createTestAgentTerminalPresentation('zh-cn'),
    );
    expect(zh).toEqual({
      kind: 'error',
      diagnosticCode: 'skill.invocation-failed',
      error: 'Skill 调用失败：EPIPE: /external/路径',
    });
  });
});
