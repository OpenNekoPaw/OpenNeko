// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nService, type SupportedLocale } from '@neko/ui/i18n';
import { I18nProvider } from '@neko/ui/i18n/react';

import { DshAgentView } from './root';

afterEach(cleanup);

describe('DshAgentView content-creation composer', () => {
  it('keeps the final title, context rail, model, mode, attachment, and send controls', () => {
    const onModelChange = vi.fn();
    const onPermissionPresetChange = vi.fn();
    const onSubmit = vi.fn();
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-1"
        surfaceKind="workspace"
        composerConfiguration={{
          models: [
            {
              id: 'deepseek-official:deepseek-v4',
              label: 'DeepSeek V4',
              providerId: 'deepseek-official',
              modelId: 'deepseek-v4',
              providerLabel: 'DeepSeek',
              category: 'llm',
              capabilities: ['chat'],
            },
            {
              id: 'openai:gpt-5',
              label: 'GPT-5',
              providerId: 'openai',
              modelId: 'gpt-5',
              providerLabel: 'OpenAI',
              category: 'llm',
              capabilities: ['chat'],
            },
          ],
          selectedModelOptionId: 'deepseek-official:deepseek-v4',
          selectedMediaModelOptionIds: {},
          permissionPresetId: 'workspace-write',
          permissionPresets: [
            { id: 'read-only', label: 'read-only', selectable: true },
            { id: 'workspace-write', label: 'workspace-write', selectable: true },
            { id: 'danger-full-access', label: 'danger-full-access', selectable: true },
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
        onPermissionPresetChange={onPermissionPresetChange}
        onRestartRuntime={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('开始创作')).toBeTruthy();
    expect(screen.getByText('短片项目')).toBeTruthy();
    expect(screen.getByText('画板')).toBeTruthy();
    expect(view.container.querySelector('[data-workspace-canvas-context="true"]')).toBeTruthy();
    expect((screen.getByRole('button', { name: '添加附件' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: '配置模型' }));
    fireEvent.click(screen.getByRole('radio', { name: 'GPT-5' }));
    expect(onModelChange).toHaveBeenCalledWith('openai:gpt-5');
    fireEvent.click(screen.getByRole('button', { name: '执行模式' }));
    expect(screen.queryByRole('menuitemradio', { name: '计划' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Full access' }));
    expect(onPermissionPresetChange).toHaveBeenCalledWith('danger-full-access');
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: 'surface' });
  });

  it('restores the assistant entry presentation without claiming unsupported bindings', () => {
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-assistant"
        surfaceKind="assistant"
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
        onPermissionPresetChange={vi.fn()}
        onRestartRuntime={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('想聊些什么？')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: '对话' })).toBeNull();
    expect(view.container.querySelector('[data-entry-context-actions="true"]')).toBeNull();
  });

  it('owns its English presentation copy when the Desktop bundle has no chat keys', () => {
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-en"
        surfaceKind="assistant"
        composerConfiguration={{
          models: [
            {
              id: 'deepseek-official:deepseek-v4',
              label: 'DeepSeek V4',
              providerId: 'deepseek-official',
              modelId: 'deepseek-v4',
              providerLabel: 'DeepSeek',
              category: 'llm',
              capabilities: ['chat'],
            },
          ],
          selectedModelOptionId: 'deepseek-official:deepseek-v4',
          selectedMediaModelOptionIds: {},
          permissionPresetId: 'workspace-write',
          permissionPresets: [
            { id: 'read-only', label: 'read-only', selectable: true },
            { id: 'workspace-write', label: 'workspace-write', selectable: true },
            { id: 'danger-full-access', label: 'danger-full-access', selectable: true },
          ],
        }}
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
        onPermissionPresetChange={vi.fn()}
        onRestartRuntime={vi.fn()}
        onSubmit={vi.fn()}
      />,
      'en',
    );

    expect(screen.getByPlaceholderText('Describe what you want to create...')).toBeTruthy();
    expect(screen.getByText('What would you like to talk about?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Execution mode' }).textContent).toContain(
      'Workspace Write',
    );
    expect(screen.queryByRole('button', { name: 'Choose character' })).toBeNull();
    expect(view.container.textContent).not.toContain('chat.');
  });

  it('keeps the entry experience selector only on the unbound Entry Draft', async () => {
    const onSubmit = vi.fn();
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-entry"
        surfaceKind="entry"
        composerConfiguration={{
          models: [
            {
              id: 'deepseek-official:deepseek-v4',
              label: 'DeepSeek V4',
              providerId: 'deepseek-official',
              modelId: 'deepseek-v4',
              providerLabel: 'DeepSeek',
              category: 'llm',
              capabilities: ['chat'],
            },
          ],
          selectedModelOptionId: 'deepseek-official:deepseek-v4',
          selectedMediaModelOptionIds: {},
          permissionPresetId: 'workspace-write',
          permissionPresets: [
            { id: 'read-only', label: 'read-only', selectable: true },
            { id: 'workspace-write', label: 'workspace-write', selectable: true },
            { id: 'danger-full-access', label: 'danger-full-access', selectable: true },
          ],
        }}
        entryContext={{
          workspace: {
            projects: [{ projectId: 'project-1', label: 'Project One' }],
          },
          loadCharacterTargets: vi.fn(async () => ({
            targets: [
              {
                globalCharacterId: 'global-character-1',
                characterVersionId: 'character-version-1',
                displayName: 'Neko',
                versionLabel: 'Published v1',
                lineage: {
                  coverage: 'complete' as const,
                  state: 'declared-root' as const,
                  isHead: true,
                  path: [{ characterVersionId: 'character-version-1', label: 'Published v1' }],
                },
                storylines: [],
              },
            ],
            diagnostics: [],
          })),
          loadWorldTargets: vi.fn(async () => ({
            targets: [
              {
                globalWorldId: 'global-world-1',
                worldVersionId: 'world-version-1',
                displayName: 'Archive City',
                versionLabel: 'Release v1',
              },
            ],
            diagnostics: [],
          })),
        }}
        configuring={false}
        draft="Create a scene"
        loading={false}
        permissions={[]}
        runtime={{ status: 'running' }}
        submitting={false}
        onCancelPermission={vi.fn()}
        onCancelTurn={vi.fn()}
        onDecidePermission={vi.fn()}
        onDraftChange={vi.fn()}
        onModelChange={vi.fn()}
        onPermissionPresetChange={vi.fn()}
        onRestartRuntime={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('Hi，用对话开启创作')).toBeTruthy();
    expect(
      (view.container.querySelector('[data-entry-context-action="character"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (view.container.querySelector('[data-entry-context-action="world"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(screen.queryByRole('button', { name: '选择项目' })).toBeNull();
    expect(screen.getByRole('tab', { name: '对话' }).getAttribute('aria-selected')).toBe('true');
    const authoring = screen.getByRole('tab', { name: '创作' }) as HTMLButtonElement;
    expect(authoring.disabled).toBe(false);
    fireEvent.click(authoring);
    expect(screen.getByText('这次要创作什么？')).toBeTruthy();
    expect(authoring.getAttribute('aria-selected')).toBe('true');
    const projectAction = view.container.querySelector(
      '[data-entry-context-action="project"]',
    ) as HTMLButtonElement;
    expect(projectAction.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: '选择角色' })).toBeNull();
    expect(screen.queryByRole('button', { name: '选择世界' })).toBeNull();
    fireEvent.click(projectAction);
    fireEvent.click(screen.getByTitle('Project One'));
    expect(await screen.findByRole('button', { name: '清除: Project One' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    expect(onSubmit).toHaveBeenCalledWith({ kind: 'project', projectId: 'project-1' });
  });

  it('loads and selects exact Character and World context without starting a DSH session', async () => {
    const loadCharacterTargets = vi.fn(async () => ({
      targets: [
        {
          globalCharacterId: 'global-character-1',
          characterVersionId: 'character-version-1',
          displayName: 'Neko',
          versionLabel: 'Published v1',
          lineage: {
            coverage: 'complete' as const,
            state: 'declared-root' as const,
            isHead: true,
            path: [{ characterVersionId: 'character-version-1', label: 'Published v1' }],
          },
          storylines: [],
        },
      ],
      diagnostics: [],
    }));
    const loadWorldTargets = vi.fn(async () => ({
      targets: [
        {
          globalWorldId: 'global-world-1',
          worldVersionId: 'world-version-1',
          displayName: 'Archive City',
          versionLabel: 'Release v1',
        },
      ],
      diagnostics: [],
    }));
    const onSubmit = vi.fn();
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-entry-context"
        surfaceKind="entry"
        entryContext={{
          workspace: { projects: [] },
          loadCharacterTargets,
          loadWorldTargets,
        }}
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
        onPermissionPresetChange={vi.fn()}
        onRestartRuntime={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(
      view.container.querySelector('[data-entry-context-action="character"]') as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(
        view.container.querySelector('.agent-entry-quick-toggle')?.getAttribute('aria-expanded'),
      ).toBe('true'),
    );
    expect(await screen.findByText('Neko')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Neko'));
    expect(loadCharacterTargets).toHaveBeenCalledOnce();
    expect(screen.getAllByText('Neko').length).toBeGreaterThan(1);

    fireEvent.click(
      view.container.querySelector('[data-entry-context-action="world"]') as HTMLButtonElement,
    );
    expect(await screen.findByText('Archive City')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Archive City'));
    expect(loadWorldTargets).toHaveBeenCalledOnce();
    expect(screen.getAllByText('Archive City').length).toBeGreaterThan(1);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '清除: Neko' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '清除: Neko' })).toBeNull());
  });

  it('adapts an active DSH turn without exposing the retired message queue', () => {
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-active"
        surfaceKind="assistant"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          currentTurn: 1,
          events: [{ kind: 'turn', turn: 1, phase: 'start' }],
        }}
        configuring={false}
        draft="next message"
        loading={false}
        permissions={[]}
        runtime={{ status: 'running' }}
        submitting={false}
        onCancelPermission={vi.fn()}
        onCancelTurn={vi.fn()}
        onDecidePermission={vi.fn()}
        onDraftChange={vi.fn()}
        onModelChange={vi.fn()}
        onPermissionPresetChange={vi.fn()}
        onRestartRuntime={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '停止回答 (Esc)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '加入队列 (Enter)' })).toBeNull();
    expect(view.container.querySelector('[data-empty-state="false"]')).toBeTruthy();
  });
});

function renderAgent(view: JSX.Element, locale: SupportedLocale = 'zh-cn') {
  return render(<I18nProvider service={new I18nService(locale)}>{view}</I18nProvider>);
}
