// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DshAgentView } from './root';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ locale: 'zh-cn' }),
}));

afterEach(cleanup);

describe('DshAgentView content-creation composer', () => {
  it('keeps the final title, context rail, model, mode, attachment, and send controls', () => {
    const onModelChange = vi.fn();
    const onModeChange = vi.fn();
    const onSubmit = vi.fn();
    const view = render(
      <DshAgentView
        agentSurfaceId="surface-1"
        composerConfiguration={{
          models: [
            {
              id: 'deepseek-official:deepseek-v4',
              label: 'DeepSeek V4',
              providerId: 'deepseek-official',
              modelId: 'deepseek-v4',
            },
            { id: 'openai:gpt-5', label: 'GPT-5', providerId: 'openai', modelId: 'gpt-5' },
          ],
          selectedModelOptionId: 'deepseek-official:deepseek-v4',
          executionMode: 'ask',
          modes: [
            { id: 'plan', available: false, diagnostic: 'Plan is unavailable.' },
            { id: 'ask', available: true },
            { id: 'auto', available: true },
          ],
          context: {
            kind: 'workspace',
            workspaceId: 'workspace-1',
            workspaceLabel: '短片项目',
            canvas: { kind: 'workspace-board', label: '画板' },
          },
        }}
        configuring={false}
        draft="创建一个分镜"
        loading={false}
        permissions={[]}
        runtime={{ status: 'running' }}
        submitting={false}
        onCancelPermission={vi.fn()}
        onCancelTurn={vi.fn()}
        onDecidePermission={vi.fn()}
        onDraftChange={vi.fn()}
        onModelChange={onModelChange}
        onModeChange={onModeChange}
        onRestartRuntime={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('Hi，用对话开启创作')).toBeTruthy();
    expect(screen.getByText('短片项目')).toBeTruthy();
    expect(screen.getByText('画板')).toBeTruthy();
    expect(view.container.querySelector('[data-workspace-canvas-context="true"]')).toBeTruthy();
    expect((screen.getByRole('button', { name: '添加上下文' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: '模型' }));
    fireEvent.click(screen.getByRole('radio', { name: 'GPT-5' }));
    expect(onModelChange).toHaveBeenCalledWith('openai:gpt-5');
    fireEvent.click(screen.getByRole('button', { name: '执行模式' }));
    expect(
      (screen.getByRole('menuitemradio', { name: /Plan/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Auto' }));
    expect(onModeChange).toHaveBeenCalledWith('auto');
    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('restores the assistant entry presentation without claiming unsupported bindings', () => {
    const view = render(
      <DshAgentView
        agentSurfaceId="surface-assistant"
        entryKind="assistant"
        configuring={false}
        draft=""
        loading={false}
        permissions={[]}
        runtime={{ status: 'running' }}
        submitting={false}
        onCancelPermission={vi.fn()}
        onCancelTurn={vi.fn()}
        onDecidePermission={vi.fn()}
        onDraftChange={vi.fn()}
        onModelChange={vi.fn()}
        onModeChange={vi.fn()}
        onRestartRuntime={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('想聊些什么？')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '对话' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByRole('tab', { name: '创作' }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.container.querySelector('[data-entry-context-actions="true"]')).toBeTruthy();
    expect((screen.getByRole('button', { name: '选择角色' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: '选择世界' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
