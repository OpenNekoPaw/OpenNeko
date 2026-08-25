// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nService, type SupportedLocale } from '@neko/ui/i18n';
import { I18nProvider } from '@neko/ui/i18n/react';
import type { DshComposerMaterializedAssetProjection } from '@neko/agent-contracts/dsh-session-host';

import { DshAgentView } from './root';
import {
  createDshComposerSessionPresentationSnapshotStore,
  DshComposerPresentationSnapshotProvider,
} from './presentation-snapshot';

const workspaceBoardTarget = {
  kind: 'workspace-board' as const,
  workspaceId: 'workspace-1',
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DshAgentView content-creation composer', () => {
  it('uses an optional assistant identity node without changing the role-based event', () => {
    const projection = {
      conversationId: 'conversation-character',
      dshSessionId: 'dsh-character',
      title: 'Neko',
      inbox: { nextTurn: [], nextStep: [] },
      events: [
        {
          kind: 'message' as const,
          role: 'assistant' as const,
          turn: 1,
          step: 1,
          text: 'Hello.',
          messageId: 'message-character',
          state: 'final' as const,
        },
      ],
    };
    renderAgent(
      <DshComposerHarness
        messageAuthorPresentation={{ assistant: <span data-testid="character-avatar">N</span> }}
        onSubmit={vi.fn(async () => true)}
        projection={projection}
      />,
    );

    expect(screen.getByTestId('character-avatar')).toBeTruthy();
    expect(screen.queryByLabelText('Agent')).toBeNull();
    expect(projection.events[0]?.role).toBe('assistant');
  });

  it('projects DSH next-request pressure through the existing usage indicator', () => {
    renderAgent(
      <DshComposerHarness
        onSubmit={vi.fn(async () => true)}
        projection={{
          conversationId: 'conversation-pressure',
          dshSessionId: 'dsh-pressure',
          title: 'Image review',
          contextPressure: {
            pressureTokens: 38_924,
            projectedTokens: 41_100,
            contextWindow: 256_000,
          },
          inbox: { nextTurn: [], nextStep: [] },
          events: [],
        }}
      />,
    );

    fireEvent.mouseEnter(screen.getByTitle('点击压缩上下文'));
    expect(screen.getByText(/41,100 \/ 256,000/u)).toBeTruthy();
    expect(screen.getByText(/16\.1%/u)).toBeTruthy();
  });

  it('keeps the OpenNeko composer active and projects the DSH inbox queue during a turn', () => {
    const onRemoveQueuedMessage = vi.fn();
    const onSendQueuedMessageNow = vi.fn();
    renderAgent(
      <DshComposerHarness
        onSubmit={vi.fn(async () => true)}
        onRemoveQueuedMessage={onRemoveQueuedMessage}
        onSendQueuedMessageNow={onSendQueuedMessageNow}
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          currentTurn: 2,
          inbox: {
            nextTurn: [
              {
                messageId: 'message-next',
                createdAt: 1_000,
                content: [{ type: 'text', text: 'queued request' }],
              },
            ],
            nextStep: [],
          },
          events: [{ kind: 'turn', turn: 2, phase: 'start', startedAt: 1_000 }],
        }}
      />,
    );

    const titlebar = screen.getByLabelText('会话标题');
    expect(titlebar.textContent).toBe('Workspace planning');
    expect(titlebar.nextElementSibling?.classList.contains('agent-message-list')).toBe(true);
    expect(screen.getByText('消息队列（1 条待处理）')).toBeTruthy();
    expect(screen.getByText('queued request')).toBeTruthy();
    expect(screen.queryByTitle('重新编辑排队消息')).toBeNull();
    fireEvent.click(screen.getByTitle('立即发送'));
    expect(onSendQueuedMessageNow).toHaveBeenCalledWith('message-next');
    fireEvent.click(screen.getByTitle('取消排队消息'));
    expect(onRemoveQueuedMessage).toHaveBeenCalledWith('message-next');
  });

  it('dispatches DSH commands and Skills from the retained Composer menus without prompt fallback', async () => {
    const onSubmit = vi.fn(async () => true);
    renderAgent(<DshComposerHarness conversationId={undefined} onSubmit={onSubmit} />);
    const composer = screen.getByLabelText('消息');

    fireEvent.change(composer, { target: { value: '/' } });
    expect(await screen.findByText('/help')).toBeTruthy();
    fireEvent.click(screen.getByText('/help'));
    fireEvent.change(composer, { target: { value: '/help models' } });
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { kind: 'surface' },
        { kind: 'command', line: '/help models' },
      ),
    );

    fireEvent.change(composer, { target: { value: '$story-review $scene-plan chapter-1' } });
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith(
        { kind: 'surface' },
        {
          kind: 'skills',
          invocations: [{ skillName: 'story-review' }, { skillName: 'scene-plan' }],
          displayText: '$story-review $scene-plan chapter-1',
          promptText: 'chapter-1',
          canvasTurnTarget: workspaceBoardTarget,
        },
      ),
    );

    fireEvent.change(composer, { target: { value: '/missing' } });
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    expect(await screen.findByText(/unknown or stale/u)).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect((composer as HTMLTextAreaElement).value).toBe('/missing');
  });

  it('requests exact Workspace mentions and submits only the selected ContentLocator', async () => {
    const onSubmit = vi.fn(async () => true);
    const onRequestMentions = vi.fn();
    renderAgent(
      <DshComposerHarness
        onSubmit={onSubmit}
        onRequestMentions={onRequestMentions}
        mentionItems={[
          {
            id: 'files:scene',
            kind: 'file',
            label: 'scene.md',
            contentLocator: { file: { authority: 'workspace', path: 'notes/scene.md' } },
            source: 'workspace',
            mediaType: 'text',
          },
        ]}
      />,
    );
    const composer = screen.getByLabelText('消息');

    fireEvent.change(composer, { target: { value: '@' } });
    expect(await screen.findByText('输入以搜索文件、素材、媒体或实体')).toBeTruthy();
    expect(screen.getByText('文件')).toBeTruthy();
    expect(screen.getByText('工作区')).toBeTruthy();
    expect(screen.getByText('文本')).toBeTruthy();

    fireEvent.change(composer, { target: { value: '@sce' } });
    await waitFor(() => expect(onRequestMentions).toHaveBeenCalledWith('sce'));
    fireEvent.click(await screen.findByText('scene.md'));
    expect(screen.getByRole('button', { name: 'Remove scene.md' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { kind: 'surface' },
        {
          kind: 'message',
          text: '',
          references: [
            {
              label: 'scene.md',
              contentLocator: { file: { authority: 'workspace', path: 'notes/scene.md' } },
            },
          ],
          images: [],
          contextPayloads: [],
          canvasTurnTarget: workspaceBoardTarget,
        },
      ),
    );
  });

  it('clears an asynchronously submitted draft while allowing the next draft to be edited', async () => {
    let resolveSubmission!: (accepted: boolean) => void;
    const pendingSubmission = new Promise<boolean>((resolve) => {
      resolveSubmission = resolve;
    });
    const onSubmit = vi.fn(() => pendingSubmission);
    renderAgent(<DshComposerHarness onSubmit={onSubmit} />);
    const composer = screen.getByLabelText('消息') as HTMLTextAreaElement;

    fireEvent.change(composer, { target: { value: 'first request' } });
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));

    await waitFor(() => expect(composer.value).toBe(''));
    expect(composer.disabled).toBe(false);
    fireEvent.change(composer, { target: { value: 'next request' } });
    expect(composer.value).toBe('next request');

    await act(async () => resolveSubmission(true));
    expect(composer.value).toBe('next request');
  });

  it('reuses the retained mention menu and submits an Asset only after Workspace materialization', async () => {
    const onSubmit = vi.fn(async () => true);
    const onMaterializeAsset = vi.fn(async (assetId: string) => ({
      assetId,
      label: 'Lighting reference.png',
      contentLocator: {
        file: { authority: 'workspace' as const, path: 'assets/Lighting reference.png' },
      },
      source: 'asset-library' as const,
      mediaType: 'image' as const,
    }));
    renderAgent(
      <DshComposerHarness
        onSubmit={onSubmit}
        onMaterializeAsset={onMaterializeAsset}
        mentionItems={[
          {
            id: 'assets:lighting',
            kind: 'asset',
            label: 'Lighting reference',
            description: 'Soft studio lighting',
            assetId: 'asset-lighting',
            source: 'asset-library',
          },
        ]}
      />,
    );
    const composer = screen.getByLabelText('消息');
    fireEvent.change(composer, { target: { value: '@light' } });
    fireEvent.click(await screen.findByText('Lighting reference'));
    await waitFor(() => expect(onMaterializeAsset).toHaveBeenCalledWith('asset-lighting'));
    expect(
      await screen.findByRole('button', { name: 'Remove Lighting reference.png' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { kind: 'surface' },
        {
          kind: 'message',
          text: '',
          references: [
            {
              label: 'Lighting reference.png',
              contentLocator: {
                file: {
                  authority: 'workspace',
                  path: 'assets/Lighting reference.png',
                },
              },
            },
          ],
          images: [],
          contextPayloads: [],
          canvasTurnTarget: workspaceBoardTarget,
        },
      ),
    );
  });

  it('keeps the draft editable but blocks submission while an Asset is being materialized', async () => {
    const onSubmit = vi.fn(async () => true);
    let resolveMaterialization!: (value: DshComposerMaterializedAssetProjection) => void;
    const pendingMaterialization = new Promise<DshComposerMaterializedAssetProjection>(
      (resolve) => {
        resolveMaterialization = resolve;
      },
    );
    renderAgent(
      <DshComposerHarness
        onSubmit={onSubmit}
        onMaterializeAsset={() => pendingMaterialization}
        mentionItems={[
          {
            id: 'assets:lighting',
            kind: 'asset',
            label: 'Lighting reference',
            assetId: 'asset-lighting',
            source: 'asset-library',
          },
        ]}
      />,
    );
    const composer = screen.getByLabelText('消息') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: '@light' } });
    fireEvent.click(await screen.findByText('Lighting reference'));

    expect(await screen.findByText('正在将素材添加到工作区...')).toBeTruthy();
    expect(composer.disabled).toBe(false);
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: 'continue editing' } });

    await act(async () =>
      resolveMaterialization({
        assetId: 'asset-lighting',
        label: 'Lighting reference.png',
        contentLocator: {
          file: { authority: 'workspace', path: 'assets/Lighting reference.png' },
        },
        source: 'asset-library',
      }),
    );
    expect(screen.queryByText('正在将素材添加到工作区...')).toBeNull();
    expect(composer.value).toBe('continue editing');
    expect(screen.getByRole('button', { name: 'Remove Lighting reference.png' })).toBeTruthy();
  });

  it('does not carry a materialized Asset reference into another exact Conversation', async () => {
    const onSubmit = vi.fn(async () => true);
    const onMaterializeAsset = vi.fn(async (assetId: string) => ({
      assetId,
      label: 'Lighting reference.png',
      contentLocator: {
        file: { authority: 'workspace' as const, path: 'assets/Lighting reference.png' },
      },
      source: 'asset-library' as const,
    }));
    const view = renderAgent(
      <DshComposerHarness
        conversationId="conversation-1"
        onSubmit={onSubmit}
        onMaterializeAsset={onMaterializeAsset}
        mentionItems={[
          {
            id: 'assets:lighting',
            kind: 'asset',
            label: 'Lighting reference',
            assetId: 'asset-lighting',
            source: 'asset-library',
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText('消息'), { target: { value: '@light' } });
    fireEvent.click(await screen.findByText('Lighting reference'));
    expect(
      await screen.findByRole('button', { name: 'Remove Lighting reference.png' }),
    ).toBeTruthy();

    rerenderAgent(
      view,
      <DshComposerHarness conversationId="conversation-2" onSubmit={onSubmit} mentionItems={[]} />,
    );
    expect(screen.queryByRole('button', { name: 'Remove Lighting reference.png' })).toBeNull();
  });

  it('does not overwrite a newer draft when Asset materialization finishes', async () => {
    let finishMaterialization!: (value: DshComposerMaterializedAssetProjection) => void;
    const pending = new Promise<DshComposerMaterializedAssetProjection>((resolve) => {
      finishMaterialization = resolve;
    });
    renderAgent(
      <DshComposerHarness
        onSubmit={vi.fn(async () => true)}
        onMaterializeAsset={() => pending}
        mentionItems={[
          {
            id: 'assets:lighting',
            kind: 'asset',
            label: 'Lighting reference',
            assetId: 'asset-lighting',
            source: 'asset-library',
          },
        ]}
      />,
    );
    const composer = screen.getByLabelText('消息') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: '@light' } });
    fireEvent.click(await screen.findByText('Lighting reference'));
    fireEvent.change(composer, { target: { value: 'continue writing' } });

    await act(async () =>
      finishMaterialization({
        assetId: 'asset-lighting',
        label: 'Lighting reference.png',
        contentLocator: {
          file: { authority: 'workspace', path: 'assets/Lighting reference.png' },
        },
        source: 'asset-library',
      }),
    );

    expect(composer.value).toBe('continue writing');
    expect(
      await screen.findByRole('button', { name: 'Remove Lighting reference.png' }),
    ).toBeTruthy();
  });

  it('renders canonical DSH command lifecycle as one retained activity', () => {
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-command"
        surfaceKind="assistant"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          events: [
            {
              kind: 'command',
              commandId: 'command-1',
              name: 'help',
              args: 'models',
              status: 'completed',
              text: 'Available models',
            },
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
        onSubmit={vi.fn(async () => true)}
      />,
    );

    expect(view.container.querySelectorAll('[data-agent-command-id="command-1"]')).toHaveLength(1);
    expect(screen.getByText('/help models')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /help models/u }));
    expect(screen.getByText('Available models')).toBeTruthy();
  });

  it('copies and fully expands complete DSH Tool payloads', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const rawOutput = {
      diagnostics: Array.from({ length: 40 }, (_, index) => ({
        code: `diagnostic-${index}`,
        message: `detail-${index}`,
      })),
    };
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-tool"
        surfaceKind="assistant"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          events: [
            {
              kind: 'tool',
              turn: 1,
              toolCallId: 'tool-1',
              title: 'openneko.document',
              status: 'completed',
              rawInput: { operation: 'read' },
              rawOutput,
            },
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
    );

    fireEvent.click(screen.getByRole('button', { name: /openneko\.document/u }));
    const output = view.container.querySelector('[data-agent-tool-payload="结果"]');
    expect(output?.className).toContain('overflow-y-auto');
    fireEvent.click(screen.getAllByRole('button', { name: '复制' })[1]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(JSON.stringify(rawOutput, null, 2)));
    expect(screen.getByRole('button', { name: '已复制' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: '展开全部' })[1]!);
    expect(output?.className).toContain('max-h-none');
    expect(screen.getByRole('button', { name: '收起' })).toBeTruthy();
  });

  it('renders a failed DSH Tool event as a visible error state', () => {
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-tool-failure"
        surfaceKind="assistant"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          events: [
            {
              kind: 'tool',
              turn: 1,
              toolCallId: 'tool-failed',
              title: 'openneko.document',
              status: 'failed',
              rawInput: { operation: 'read-images' },
              rawOutput: 'content-missing: Document content is unavailable.',
            },
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
    );

    const toolCard = view.container.querySelector('[data-agent-tool-call-id="tool-failed"]');
    expect(toolCard?.className).toContain('is-danger');
    expect(screen.getByRole('button', { name: /openneko\.document.*失败/u })).toBeTruthy();
  });

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
            canvas: {
              workspaceId: 'workspace-1',
              defaultTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
              options: [
                {
                  target: { kind: 'workspace-board', workspaceId: 'workspace-1' },
                  label: '画板',
                },
                {
                  target: {
                    kind: 'exact-canvas',
                    workspaceId: 'workspace-1',
                    canvasId: 'neko/boards/story.nkc',
                  },
                  label: 'story.nkc',
                  summary: {
                    canvasId: 'neko/boards/story.nkc',
                    name: 'story.nkc',
                    nodeTypeSummary: { text: 2 },
                  },
                },
              ],
              diagnostics: [],
            },
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
    expect(screen.getByText('工作区画板')).toBeTruthy();
    expect(screen.getByPlaceholderText('描述你想要完成的内容...')).toBeTruthy();
    expect(view.container.querySelector('[data-workspace-canvas-context="true"]')).toBeTruthy();
    expect((screen.getByRole('button', { name: '添加附件' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: '配置模型' }));
    fireEvent.click(screen.getByRole('radio', { name: 'GPT-5' }));
    expect(onModelChange).toHaveBeenCalledWith('openai:gpt-5');
    fireEvent.click(screen.getByRole('button', { name: '执行模式' }));
    expect(screen.queryByRole('menuitemradio', { name: '计划' })).toBeNull();
    expect(screen.getByRole('menuitemradio', { name: '只读' })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: '工作区可写' })).toBeTruthy();
    expect(screen.queryByRole('menuitemradio', { name: 'Full access' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitemradio', { name: '完全访问' }));
    expect(onPermissionPresetChange).toHaveBeenCalledWith('danger-full-access');
    fireEvent.change(screen.getByRole('combobox', { name: '画布索引' }), {
      target: { value: 'neko/boards/story.nkc' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { kind: 'surface' },
      {
        kind: 'message',
        text: '创建一个分镜',
        references: [],
        images: [],
        contextPayloads: [],
        canvasTurnTarget: {
          kind: 'exact-canvas',
          workspaceId: 'workspace-1',
          canvasId: 'neko/boards/story.nkc',
        },
      },
    );
  });

  it('restores the exact Conversation Canvas after the Agent scene unmounts', async () => {
    const onSubmit = vi.fn(
      async (
        _target: Parameters<React.ComponentProps<typeof DshAgentView>['onSubmit']>[0],
        _input: Parameters<React.ComponentProps<typeof DshAgentView>['onSubmit']>[1],
      ) => true,
    );
    const scene = (visible: boolean, conversationId = 'conversation-1') => (
      <DshComposerPresentationSnapshotProvider>
        <I18nProvider service={new I18nService('zh-cn')}>
          {visible ? (
            <WorkspaceCanvasSelectionHarness conversationId={conversationId} onSubmit={onSubmit} />
          ) : null}
        </I18nProvider>
      </DshComposerPresentationSnapshotProvider>
    );
    const view = render(scene(true));
    fireEvent.change(screen.getByRole('combobox', { name: '画布索引' }), {
      target: { value: 'neko/boards/story.nkc' },
    });

    view.rerender(scene(false));
    view.rerender(scene(true));

    expect((screen.getByRole('combobox', { name: '画布索引' }) as HTMLSelectElement).value).toBe(
      'neko/boards/story.nkc',
    );
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[1]).toMatchObject({
      canvasTurnTarget: {
        kind: 'exact-canvas',
        workspaceId: 'workspace-1',
        canvasId: 'neko/boards/story.nkc',
      },
    });
  });

  it('restores the exact Conversation Canvas after the Renderer page owner is recreated', async () => {
    let serialized: string | null = null;
    const storage = {
      getItem: () => serialized,
      setItem: (_key: string, value: string) => {
        serialized = value;
      },
    };
    const onSubmit = vi.fn(
      async (
        _target: Parameters<React.ComponentProps<typeof DshAgentView>['onSubmit']>[0],
        _input: Parameters<React.ComponentProps<typeof DshAgentView>['onSubmit']>[1],
      ) => true,
    );
    const page = (pageKey: number) => (
      <DshComposerPresentationSnapshotProvider
        key={pageKey}
        store={createDshComposerSessionPresentationSnapshotStore(storage)}
      >
        <I18nProvider service={new I18nService('zh-cn')}>
          <WorkspaceCanvasSelectionHarness conversationId="conversation-1" onSubmit={onSubmit} />
        </I18nProvider>
      </DshComposerPresentationSnapshotProvider>
    );
    const view = render(page(1));
    fireEvent.change(screen.getByRole('combobox', { name: '画布索引' }), {
      target: { value: 'neko/boards/story.nkc' },
    });

    view.rerender(page(2));

    expect((screen.getByRole('combobox', { name: '画布索引' }) as HTMLSelectElement).value).toBe(
      'neko/boards/story.nkc',
    );
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[1]).toMatchObject({
      canvasTurnTarget: {
        kind: 'exact-canvas',
        workspaceId: 'workspace-1',
        canvasId: 'neko/boards/story.nkc',
      },
    });
  });

  it('isolates sibling Conversation selections and transfers the first-turn draft selection', async () => {
    const onSubmit = vi.fn(
      async (
        _target: Parameters<React.ComponentProps<typeof DshAgentView>['onSubmit']>[0],
        _input: Parameters<React.ComponentProps<typeof DshAgentView>['onSubmit']>[1],
      ) => true,
    );
    const scene = (conversationId?: string) => (
      <DshComposerPresentationSnapshotProvider>
        <I18nProvider service={new I18nService('zh-cn')}>
          <WorkspaceCanvasSelectionHarness conversationId={conversationId} onSubmit={onSubmit} />
        </I18nProvider>
      </DshComposerPresentationSnapshotProvider>
    );
    const view = render(scene());
    fireEvent.change(screen.getByRole('combobox', { name: '画布索引' }), {
      target: { value: 'neko/boards/story.nkc' },
    });

    view.rerender(scene('conversation-new'));
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: '画布索引' }) as HTMLSelectElement).value).toBe(
        'neko/boards/story.nkc',
      ),
    );
    view.rerender(scene('conversation-sibling'));
    expect((screen.getByRole('combobox', { name: '画布索引' }) as HTMLSelectElement).value).toBe(
      'workspace-board',
    );
    view.rerender(scene('conversation-new'));
    expect((screen.getByRole('combobox', { name: '画布索引' }) as HTMLSelectElement).value).toBe(
      'neko/boards/story.nkc',
    );
  });

  it('submits a pasted image through the canonical DSH image input', async () => {
    const onSubmit = vi.fn(async () => true);
    renderAgent(<DshComposerHarness onSubmit={onSubmit} />);
    const composer = screen.getByRole('textbox', { name: '消息' });

    fireEvent.change(composer, { target: { value: '分析这张图片' } });
    fireEvent.paste(composer, {
      clipboardData: {
        getData: () => '',
        items: [
          {
            type: 'image/png',
            getAsFile: () =>
              new File([new Uint8Array([1, 2, 3])], 'clipboard.png', {
                type: 'image/png',
              }),
          },
        ],
      },
    });

    await screen.findByRole('button', { name: /Remove pasted-image-/u });
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      { kind: 'surface' },
      {
        kind: 'message',
        text: '分析这张图片',
        references: [],
        images: [
          {
            name: expect.stringMatching(/^pasted-image-\d+\.png$/u),
            mimeType: 'image/png',
            data: 'AQID',
          },
        ],
        contextPayloads: [],
        canvasTurnTarget: workspaceBoardTarget,
      },
    );
  });

  it('restores pasted image content when Host admission rejects the submission', async () => {
    const onSubmit = vi.fn(async () => false);
    renderAgent(<DshComposerHarness onSubmit={onSubmit} />);
    const composer = screen.getByRole('textbox', { name: '消息' });

    fireEvent.change(composer, { target: { value: '分析失败时不要丢图' } });
    fireEvent.paste(composer, {
      clipboardData: {
        getData: () => '',
        items: [
          {
            type: 'image/png',
            getAsFile: () =>
              new File([new Uint8Array([1, 2, 3])], 'clipboard.png', { type: 'image/png' }),
          },
        ],
      },
    });

    await screen.findByRole('button', { name: /Remove pasted-image-/u });
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: '消息' }) as HTMLTextAreaElement).value).toBe(
        '分析失败时不要丢图',
      ),
    );
    expect(screen.getByRole('button', { name: /Remove pasted-image-/u })).toBeTruthy();
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
          experimentalCreative: {
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
          },
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

    expect(screen.queryByLabelText('会话标题')).toBeNull();
    expect(screen.queryByRole('heading', { name: '新会话' })).toBeNull();
    expect(screen.getByText('Hi，用对话开启创作')).toBeTruthy();
    expect(
      (view.container.querySelector('[data-entry-context-action="character"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (view.container.querySelector('[data-entry-context-action="world"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      view.container.querySelector('.agent-entry-quick-toggle')?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(view.container.querySelector('[data-entry-panel-mode="assistant"]')).toBeTruthy();
    expect(await screen.findByText('Neko')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '选择项目' })).toBeNull();
    expect(screen.getByRole('tab', { name: '对话' }).getAttribute('aria-selected')).toBe('true');
    const authoring = screen.getByRole('tab', { name: '创作' }) as HTMLButtonElement;
    expect(authoring.disabled).toBe(false);
    fireEvent.click(authoring);
    expect(screen.getByText('这次要创作什么？')).toBeTruthy();
    expect(authoring.getAttribute('aria-selected')).toBe('true');
    expect(
      view.container.querySelector('.agent-entry-quick-toggle')?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(view.container.querySelector('[data-entry-panel-mode="authoring"]')).toBeTruthy();
    expect(screen.getByTitle('Project One')).toBeTruthy();
    const projectAction = view.container.querySelector(
      '[data-entry-context-action="project"]',
    ) as HTMLButtonElement;
    expect(projectAction.disabled).toBe(false);
    expect(screen.queryByText('开始创作前请选择项目。')).toBeNull();
    expect(
      (screen.getByRole('button', { name: '发送 (Enter)' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole('button', { name: '选择角色' })).toBeNull();
    expect(screen.queryByRole('button', { name: '选择世界' })).toBeNull();
    fireEvent.click(projectAction);
    fireEvent.click(screen.getByTitle('Project One'));
    expect(await screen.findByRole('button', { name: '清除: Project One' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { kind: 'project', projectId: 'project-1' },
      { kind: 'message', text: 'Create a scene', references: [], images: [], contextPayloads: [] },
    );
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
          experimentalCreative: { loadCharacterTargets, loadWorldTargets },
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

    expect(
      view.container.querySelector('.agent-entry-quick-toggle')?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(await screen.findByText('Neko')).toBeTruthy();
    expect(loadCharacterTargets).toHaveBeenCalledOnce();

    fireEvent.click(
      view.container.querySelector('[data-entry-context-action="character"]') as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(
        view.container.querySelector('.agent-entry-quick-toggle')?.getAttribute('aria-expanded'),
      ).toBe('true'),
    );
    fireEvent.click(screen.getByTitle('Neko'));
    expect(loadCharacterTargets).toHaveBeenCalledOnce();
    expect(screen.getAllByText('Neko').length).toBeGreaterThan(1);

    fireEvent.click(
      view.container.querySelector('[data-entry-context-action="world"]') as HTMLButtonElement,
    );
    expect(
      view.container.querySelector('.agent-entry-quick-toggle')?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(await screen.findByText('Archive City')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Archive City'));
    expect(loadWorldTargets).toHaveBeenCalledOnce();
    expect(screen.getAllByText('Archive City').length).toBeGreaterThan(1);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '清除: Neko' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '清除: Neko' })).toBeNull());
  });

  it('submits the exact adopted Character handoff instead of a surface Assistant target', async () => {
    const onSubmit = vi.fn(async () => true);
    const onConsumed = vi.fn();
    renderAgent(
      <DshAgentView
        agentSurfaceId="surface-character-handoff"
        surfaceKind="entry"
        composerConfiguration={{
          models: [
            {
              id: 'provider:model',
              label: 'Model',
              providerId: 'provider',
              modelId: 'model',
              providerLabel: 'Provider',
              category: 'llm',
              capabilities: ['chat'],
            },
          ],
          selectedModelOptionId: 'provider:model',
          selectedMediaModelOptionIds: {},
          permissionPresetId: 'workspace-write',
          permissionPresets: [
            { id: 'workspace-write', label: 'Workspace Write', selectable: true },
          ],
        }}
        entryContext={{
          workspace: { projects: [] },
          experimentalCreative: {
            loadCharacterTargets: vi.fn(async () => ({ targets: [], diagnostics: [] })),
            loadWorldTargets: vi.fn(async () => ({ targets: [], diagnostics: [] })),
          },
        }}
        initialCharacterDialogueHandoff={{
          kind: 'character-dialogue',
          intentId: 'intent-character-1',
          label: 'Neko',
          binding: {
            kind: 'character-dialogue',
            mode: 'companion',
            participants: [
              {
                globalCharacterId: 'global-character-1',
                characterVersionId: 'character-version-1',
              },
            ],
          },
        }}
        onCharacterDialogueHandoffConsumed={onConsumed}
        configuring={false}
        draft="Hello Neko"
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

    expect(await screen.findByRole('button', { name: '清除: Neko' })).toBeTruthy();
    expect(onConsumed).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '发送 (Enter)' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          kind: 'character-dialogue',
          mode: 'companion',
          participants: [
            {
              globalCharacterId: 'global-character-1',
              characterVersionId: 'character-version-1',
            },
          ],
        },
        {
          kind: 'message',
          text: 'Hello Neko',
          references: [],
          images: [],
          contextPayloads: [],
        },
      ),
    );
  });

  it('keeps Project Creation while omitting experimental creative context in Release', () => {
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-release-entry"
        surfaceKind="entry"
        entryContext={{
          workspace: { projects: [{ projectId: 'project-1', label: 'Project One' }] },
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
    );

    expect(view.container.querySelector('[data-entry-context-action="character"]')).toBeNull();
    expect(view.container.querySelector('[data-entry-context-action="world"]')).toBeNull();
    expect(view.container.querySelector('.agent-entry-quick-toggle')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '创作' }));
    expect(view.container.querySelector('[data-entry-context-action="project"]')).toBeTruthy();
    expect(screen.getByText('Project One')).toBeTruthy();
  });

  it('shows live elapsed time for the active DSH turn and removes it on canonical completion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-active"
        surfaceKind="assistant"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          currentTurn: 1,
          events: [{ kind: 'turn', turn: 1, phase: 'start', startedAt: 10_000 }],
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
    expect(screen.getByRole('status').textContent).toBe('回合 1 处理中 · 已用时 0秒');

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole('status').textContent).toBe('回合 1 处理中 · 已用时 3秒');

    rerenderAgent(
      view,
      <DshAgentView
        agentSurfaceId="surface-active"
        surfaceKind="assistant"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          events: [
            { kind: 'turn', turn: 1, phase: 'start', startedAt: 10_000 },
            {
              kind: 'turn',
              turn: 1,
              phase: 'end',
              startedAt: 10_000,
              completedAt: 12_500,
              reason: 'completed',
            },
          ],
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

    expect(view.container.querySelector('[data-agent-active-turn]')).toBeNull();
    expect(screen.queryByText(/处理中/)).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('回合 1 已结束 · 用时 2秒 · completed');
  });

  it('shows canonical DSH turn duration in the existing status row', () => {
    renderAgent(
      <DshAgentView
        agentSurfaceId="surface-duration"
        surfaceKind="assistant"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          events: [
            { kind: 'turn', turn: 2, phase: 'start', startedAt: 1_000 },
            {
              kind: 'turn',
              turn: 2,
              phase: 'end',
              startedAt: 1_000,
              completedAt: 66_000,
              reason: 'completed',
            },
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
    );

    expect(screen.getByRole('status').textContent).toBe('回合 2 已结束 · 用时 1分05秒 · completed');
  });

  it('renders DSH streaming text and reasoning through the retained transcript components', () => {
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-stream"
        surfaceKind="assistant"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          currentTurn: 4,
          events: [
            { kind: 'turn', turn: 4, phase: 'start', startedAt: 1_000 },
            {
              kind: 'thought',
              turn: 4,
              step: 0,
              text: 'Inspect the workspace.',
              messageId: 'dsh:4:0:reasoning',
              state: 'streaming',
            },
            {
              kind: 'message',
              role: 'assistant',
              turn: 4,
              step: 0,
              text: 'Draft answer',
              messageId: 'dsh:4:0:text',
              state: 'streaming',
            },
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
    );

    expect(screen.getByText('Inspect the workspace.')).toBeTruthy();
    expect(screen.getByText('Draft answer')).toBeTruthy();
    expect(view.container.querySelector('[data-agent-thought-state="streaming"]')).toBeTruthy();
    expect(view.container.querySelector('[data-agent-message-state="streaming"]')).toBeTruthy();

    rerenderAgent(
      view,
      <DshAgentView
        agentSurfaceId="surface-stream"
        surfaceKind="assistant"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          events: [
            { kind: 'turn', turn: 4, phase: 'start', startedAt: 1_000 },
            {
              kind: 'thought',
              turn: 4,
              step: 0,
              text: 'Checked the workspace.',
              messageId: 'assistant-4',
              state: 'final',
            },
            {
              kind: 'message',
              role: 'assistant',
              turn: 4,
              step: 0,
              text: 'Final answer',
              messageId: 'assistant-4',
              state: 'final',
            },
            {
              kind: 'turn',
              turn: 4,
              phase: 'end',
              startedAt: 1_000,
              completedAt: 2_000,
              reason: 'completed',
            },
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
    );

    expect(screen.queryByText('Draft answer')).toBeNull();
    expect(screen.getByText('Final answer')).toBeTruthy();
    expect(view.container.querySelectorAll('[data-agent-message-state="final"]')).toHaveLength(1);
    expect(view.container.querySelector('[data-agent-thought-state="final"]')).toBeTruthy();
  });

  it('renders a published document link separately from the assistant summary and input tokens', () => {
    const onOpenTerminalArtifact = vi.fn();
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-artifact"
        surfaceKind="workspace"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          events: [
            {
              kind: 'message',
              role: 'assistant',
              turn: 1,
              step: 0,
              text: '已完成故事规划。',
              messageId: 'assistant-final',
              state: 'final',
              artifact: {
                kind: 'reviewable-markdown',
                title: '《BLAME！》动画化企划方案与具体操作步骤',
                contentLocator: {
                  file: {
                    authority: 'workspace',
                    path: 'neko/generated/file/story-plan.md',
                  },
                },
              },
            },
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
        onOpenTerminalArtifact={onOpenTerminalArtifact}
        onPermissionPresetChange={vi.fn()}
        onRestartRuntime={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('已完成故事规划。')).toBeTruthy();
    const reference = view.container.querySelector(
      '[data-agent-terminal-artifact="reviewable-markdown"]',
    );
    expect(reference).toBeTruthy();
    expect(reference?.classList.contains('agent-terminal-artifact-reference')).toBe(true);
    expect(reference?.querySelector('[data-agent-reference-token="true"]')).toBeNull();
    const link = screen.getByRole('button', {
      name: '打开文档：《BLAME！》动画化企划方案与具体操作步骤',
    });
    expect(link.textContent).toBe('《BLAME！》动画化企划方案与具体操作步骤');
    expect(link.textContent).not.toContain('已保存');
    expect(link.querySelector('svg')).toBeTruthy();
    expect(link.getAttribute('title')).toBe(
      '《BLAME！》动画化企划方案与具体操作步骤\nneko/generated/file/story-plan.md',
    );
    expect(reference?.textContent).not.toContain('neko/generated/file');
    fireEvent.click(link);
    expect(onOpenTerminalArtifact).toHaveBeenCalledWith('assistant-final');
  });

  it('renders mixed and resource-only user messages as ordered reference tokens', () => {
    const view = renderAgent(
      <DshAgentView
        agentSurfaceId="surface-resource"
        surfaceKind="workspace"
        conversationId="conversation-1"
        projection={{
          conversationId: 'conversation-1',
          dshSessionId: 'dsh-session-1',
          title: 'Workspace planning',
          inbox: { nextTurn: [], nextStep: [] },
          events: [
            {
              kind: 'message',
              role: 'user',
              messageId: 'user-resource',
              content: [
                { type: 'text', text: '分析前10页' },
                {
                  type: 'resource',
                  label: '[Kmoe][BLAME!（新装版）]卷01.epub',
                  contentLocator: {
                    file: { authority: 'workspace', path: 'books/blame/卷01.epub' },
                  },
                },
              ],
            },
            {
              kind: 'message',
              role: 'user',
              messageId: 'user-resource-only',
              content: [
                {
                  type: 'resource',
                  label: '[Kmoe][BLAME!（新装版）]卷02.epub',
                  contentLocator: {
                    file: { authority: 'workspace', path: 'books/blame/卷02.epub' },
                  },
                },
              ],
            },
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
    );

    expect(screen.getByText('分析前10页')).toBeTruthy();
    const filename = screen.getByText('[Kmoe][BLAME!（新装版）]卷01.epub');
    const resourceToken = filename.closest('[data-agent-reference-token="true"]');
    expect(resourceToken).toBeTruthy();
    expect(resourceToken?.getAttribute('data-reference-variant')).toBe('attached');
    expect(screen.getByText('[Kmoe][BLAME!（新装版）]卷02.epub')).toBeTruthy();
    const userPrompts = view.container.querySelectorAll('.agent-user-prompt');
    expect(userPrompts).toHaveLength(2);
    expect(userPrompts[0]?.textContent).toContain('分析前10页');
    expect(userPrompts[0]?.textContent).toContain('[Kmoe][BLAME!（新装版）]卷01.epub');
    expect(userPrompts[1]?.textContent).toContain('[Kmoe][BLAME!（新装版）]卷02.epub');
    expect(view.container.textContent).not.toContain('[resource_link');
    expect(view.container.textContent).not.toContain('openneko-content:');
  });

  it('loads replayed image thumbnails lazily and opens the authorized full preview', async () => {
    const resolvePreview = vi.fn(async () => ({
      url: 'openneko://resource/lease-1/image',
      mediaType: 'image/png' as const,
      byteLength: 4,
      width: 1,
      height: 1,
    }));
    const view = renderImageMessage(resolvePreview);

    await waitFor(() => {
      expect(
        view.container
          .querySelector('[data-agent-message-image="true"]')
          ?.getAttribute('data-image-preview-status'),
      ).toBe('ready');
    });
    expect(resolvePreview).toHaveBeenCalledWith('attachment-1');
    const prompt = view.container.querySelector('.agent-user-prompt');
    expect(prompt?.querySelector('.agent-user-prompt-primary')?.textContent).toContain('分析图片');
    expect(
      prompt?.querySelector('.agent-user-prompt-primary .agent-message-image-grid'),
    ).toBeNull();
    expect(prompt?.querySelector(':scope > .agent-message-image-grid')).toBeTruthy();
    const thumbnail = view.container.querySelector('.agent-message-image-thumbnail');
    expect(thumbnail?.getAttribute('src')).toBe('openneko://resource/lease-1/image');
    expect(thumbnail?.getAttribute('loading')).toBe('lazy');

    fireEvent.click(screen.getByRole('button', { name: '打开图片预览: clipboard.png' }));
    expect(screen.getByAltText('clipboard.png').getAttribute('src')).toBe(
      'openneko://resource/lease-1/image',
    );
  });

  it('keeps the image token and displays a local unavailable state when preview resolution fails', async () => {
    const view = renderImageMessage(vi.fn(async () => Promise.reject(new Error('missing image'))));

    await waitFor(() => {
      expect(
        view.container
          .querySelector('[data-agent-message-image="true"]')
          ?.getAttribute('data-image-preview-status'),
      ).toBe('unavailable');
    });
    expect(screen.getByText('clipboard.png')).toBeTruthy();
    expect(screen.getByText('预览不可用')).toBeTruthy();
    expect(view.container.querySelector('.agent-message-image-thumbnail')).toBeNull();
  });

  it('isolates one failed image while keeping a sibling thumbnail ready in the attachment grid', async () => {
    const view = renderImageMessage(
      vi.fn(async (attachmentId: string) => {
        if (attachmentId === 'attachment-2') throw new Error('second image missing');
        return {
          url: 'openneko://resource/lease-1/image',
          mediaType: 'image/png' as const,
          byteLength: 4,
          width: 1,
          height: 1,
        };
      }),
      2,
    );

    await waitFor(() => {
      expect(view.container.querySelectorAll('[data-image-preview-status="ready"]')).toHaveLength(
        1,
      );
      expect(
        view.container.querySelectorAll('[data-image-preview-status="unavailable"]'),
      ).toHaveLength(1);
    });
    expect(view.container.querySelectorAll('.agent-message-image-grid > *')).toHaveLength(2);
    expect(view.container.querySelectorAll('.agent-message-image-thumbnail')).toHaveLength(1);
    expect(screen.getByText('clipboard.png')).toBeTruthy();
    expect(screen.getByText('clipboard-2.png')).toBeTruthy();
  });
});

function renderImageMessage(
  onResolveImageAttachmentPreview: NonNullable<
    React.ComponentProps<typeof DshAgentView>['onResolveImageAttachmentPreview']
  >,
  imageCount = 1,
) {
  return renderAgent(
    <DshAgentView
      agentSurfaceId="surface-image"
      surfaceKind="workspace"
      conversationId="conversation-image"
      projection={{
        conversationId: 'conversation-image',
        dshSessionId: 'dsh-image',
        title: 'Image review',
        inbox: { nextTurn: [], nextStep: [] },
        events: [
          {
            kind: 'message',
            role: 'user',
            messageId: 'image-message',
            content: [
              { type: 'text', text: '分析图片' },
              ...Array.from({ length: imageCount }, (_, index) => ({
                type: 'image' as const,
                label: index === 0 ? 'clipboard.png' : `clipboard-${index + 1}.png`,
                attachment: {
                  attachmentId: `attachment-${index + 1}`,
                  mediaType: 'image/png' as const,
                  byteLength: 4,
                  width: 1,
                  height: 1,
                },
              })),
            ],
          },
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
      onResolveImageAttachmentPreview={onResolveImageAttachmentPreview}
      onRestartRuntime={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );
}

function renderAgent(view: JSX.Element, locale: SupportedLocale = 'zh-cn') {
  return render(
    <DshComposerPresentationSnapshotProvider>
      <I18nProvider service={new I18nService(locale)}>{view}</I18nProvider>
    </DshComposerPresentationSnapshotProvider>,
  );
}

function DshComposerHarness({
  conversationId = 'conversation-1',
  mentionItems = [],
  messageAuthorPresentation,
  onRequestMentions = vi.fn(),
  onMaterializeAsset,
  onRemoveQueuedMessage,
  onSendQueuedMessageNow,
  projection,
  onSubmit,
}: {
  readonly conversationId?: string;
  readonly mentionItems?: React.ComponentProps<typeof DshAgentView>['mentionItems'];
  readonly messageAuthorPresentation?: React.ComponentProps<
    typeof DshAgentView
  >['messageAuthorPresentation'];
  readonly onRequestMentions?: (filter: string) => void;
  readonly onMaterializeAsset?: React.ComponentProps<typeof DshAgentView>['onMaterializeAsset'];
  readonly onRemoveQueuedMessage?: React.ComponentProps<
    typeof DshAgentView
  >['onRemoveQueuedMessage'];
  readonly onSendQueuedMessageNow?: React.ComponentProps<
    typeof DshAgentView
  >['onSendQueuedMessageNow'];
  readonly projection?: React.ComponentProps<typeof DshAgentView>['projection'];
  readonly onSubmit: React.ComponentProps<typeof DshAgentView>['onSubmit'];
}): JSX.Element {
  const [draft, setDraft] = useState('');
  return (
    <DshAgentView
      agentSurfaceId="surface-input-catalog"
      surfaceKind="workspace"
      conversationId={conversationId}
      projection={projection}
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
        permissionPresets: [{ id: 'workspace-write', label: 'workspace-write', selectable: true }],
        context: {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceLabel: 'Workspace One',
          canvas: {
            workspaceId: 'workspace-1',
            defaultTarget: { kind: 'workspace-board', workspaceId: 'workspace-1' },
            options: [
              {
                target: { kind: 'workspace-board', workspaceId: 'workspace-1' },
                label: 'Board',
              },
            ],
            diagnostics: [],
          },
        },
        inputCatalog: {
          commands: [{ name: 'help', description: 'Show help', inputHint: '[topic]' }],
          skills: [
            {
              name: 'story-review',
              description: 'Review a story',
              source: 'personal',
              provider: 'filesystem',
            },
            {
              name: 'scene-plan',
              description: 'Plan a scene',
              source: 'personal',
              provider: 'filesystem',
            },
          ],
          skillsComplete: true,
        },
      }}
      mentionItems={mentionItems}
      messageAuthorPresentation={messageAuthorPresentation}
      configuring={false}
      draft={draft}
      loading={false}
      permissions={[]}
      runtime={{ status: 'running' }}
      submitting={false}
      onCancelPermission={vi.fn()}
      onCancelTurn={vi.fn()}
      onDecidePermission={vi.fn()}
      onDraftChange={setDraft}
      onModelChange={vi.fn()}
      onPermissionPresetChange={vi.fn()}
      onRemoveQueuedMessage={onRemoveQueuedMessage}
      onSendQueuedMessageNow={onSendQueuedMessageNow}
      onRequestMentions={onRequestMentions}
      onMaterializeAsset={onMaterializeAsset}
      onRestartRuntime={vi.fn()}
      onSubmit={onSubmit}
    />
  );
}

function WorkspaceCanvasSelectionHarness({
  conversationId,
  onSubmit,
}: {
  readonly conversationId?: string;
  readonly onSubmit: React.ComponentProps<typeof DshAgentView>['onSubmit'];
}): JSX.Element {
  const [draft, setDraft] = useState('分析画布');
  return (
    <DshAgentView
      agentSurfaceId="surface-workspace-selection"
      surfaceKind="workspace"
      conversationId={conversationId}
      composerConfiguration={{
        models: [
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
        selectedModelOptionId: 'openai:gpt-5',
        selectedMediaModelOptionIds: {},
        permissionPresetId: 'workspace-write',
        permissionPresets: [{ id: 'workspace-write', label: 'workspace-write', selectable: true }],
        context: {
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceLabel: 'Workspace One',
          canvas: {
            workspaceId: 'workspace-1',
            defaultTarget: workspaceBoardTarget,
            options: [
              { target: workspaceBoardTarget, label: 'Workspace Board' },
              {
                target: {
                  kind: 'exact-canvas',
                  workspaceId: 'workspace-1',
                  canvasId: 'neko/boards/story.nkc',
                },
                label: 'story.nkc',
              },
            ],
            diagnostics: [],
          },
        },
      }}
      configuring={false}
      draft={draft}
      loading={false}
      permissions={[]}
      runtime={{ status: 'running' }}
      submitting={false}
      onCancelPermission={vi.fn()}
      onCancelTurn={vi.fn()}
      onDecidePermission={vi.fn()}
      onDraftChange={setDraft}
      onModelChange={vi.fn()}
      onPermissionPresetChange={vi.fn()}
      onRestartRuntime={vi.fn()}
      onSubmit={onSubmit}
    />
  );
}

function rerenderAgent(
  result: ReturnType<typeof renderAgent>,
  view: JSX.Element,
  locale: SupportedLocale = 'zh-cn',
): void {
  result.rerender(
    <DshComposerPresentationSnapshotProvider>
      <I18nProvider service={new I18nService(locale)}>{view}</I18nProvider>
    </DshComposerPresentationSnapshotProvider>,
  );
}
