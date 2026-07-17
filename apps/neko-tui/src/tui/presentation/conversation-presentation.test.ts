import { describe, expect, it } from 'vitest';
import { presentTuiConversationIdDiagnostic } from './conversation-presentation';
import { createTestAgentTerminalPresentation } from './testing';

describe('conversation presentation', () => {
  it('localizes the wrapper while escaping the external conversation id literal', () => {
    expect(
      presentTuiConversationIdDiagnostic(
        { code: 'non-canonical', value: 'cli-invalid\n\u001b[31m' },
        createTestAgentTerminalPresentation('zh-cn'),
      ),
    ).toBe(
      'TUI 恢复对话 ID 必须是规范 ID；收到 "cli-invalid\\n\\u001b[31m"。请开始新的 TUI 对话，或选择当前工作区的规范对话 ID。',
    );
  });
});
