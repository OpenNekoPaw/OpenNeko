import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { AgentTerminalPresentationProvider } from '../../presentation/react-context';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import { ToolApprovalPanel } from './ToolApprovalPanel';

function renderApproval(
  approval: React.ComponentProps<typeof ToolApprovalPanel>['approval'],
  locale: 'en' | 'zh-cn',
) {
  const presentation = createTestAgentTerminalPresentation(locale);
  return render(
    <AgentTerminalPresentationProvider value={presentation}>
      <ToolApprovalPanel approval={approval} onApprove={() => {}} onReject={() => {}} />
    </AgentTerminalPresentationProvider>,
  );
}

describe('ToolApprovalPanel localization', () => {
  it('localizes approval chrome while preserving command and cwd', () => {
    const frame = renderApproval(
      {
        toolCallId: 'tool-call-原文',
        toolName: 'Bash',
        arguments: {
          command: 'printf "外部命令"',
          cwd: '/external/原文',
        },
        resolve: () => {},
      },
      'zh-cn',
    ).lastFrame();

    expect(frame).toContain('需要批准工具调用');
    expect(frame).toContain('[y]同意');
    expect(frame).toContain('[n]拒绝');
    expect(frame).toContain('[a]始终允许');
    expect(frame).toContain('工作目录：/external/原文');
    expect(frame).toContain('Bash');
    expect(frame).toContain('printf "外部命令"');
  });

  it('uses an explicit localized diff overflow message', () => {
    const content = Array.from({ length: 32 }, (_, index) => `line-${index + 1}`).join('\n');
    const frame = renderApproval(
      {
        toolCallId: 'tool-call-diff',
        toolName: 'WriteFile',
        arguments: {
          path: '/external/文件.ts',
          content,
        },
        resolve: () => {},
      },
      'zh-cn',
    ).lastFrame();

    expect(frame).toContain('/external/文件.ts');
    expect(frame).toContain('... 另有 3 行');
    expect(frame).not.toContain('more lines');
  });
});
