import { describe, expect, it, vi } from 'vitest';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import type { ChatModelOption, Task } from '@neko/shared';
import {
  handleTuiControlCommand,
  type TuiCommandRouterContext,
  type TuiExecutionMode,
  type TuiParameterValidationResult,
  type TuiSessionMode,
  type TuiArtifactPorts,
  type TuiCapabilityPorts,
} from '../tui-command-router';
import { DEFAULT_CLI_CONFIG } from '../types';
import { createStrictTranslator } from '@neko/shared/i18n';
import { createAgentTerminalPresentationContext } from '../../presentation/context';
import { CLI_TERMINAL_MESSAGE_SOURCE } from '../../presentation/terminal-messages';
import { createAgentConversationMessageQueue } from '@neko/agent/runtime';

describe('handleTuiControlCommand', () => {
  it('routes shared resource commands through canonical Presenters instead of slash-core prose', async () => {
    const context = createContext({ uiLocale: 'zh-cn' });

    const help = await handleTuiControlCommand('/help', context);
    const commands = await handleTuiControlCommand('/cmds', context);
    const skills = await handleTuiControlCommand('/skills', context);
    const tools = await handleTuiControlCommand('/tools', context);

    expect(help.source).toBe('tui-router');
    expect(help.output).toContain('可用命令：');
    expect(help.output).toContain('/help, /h, /?');
    expect(commands.source).toBe('tui-router');
    expect(commands.output).toContain('可用斜杠命令：');
    expect(skills.source).toBe('tui-router');
    expect(skills.output).toContain('可用技能：');
    expect(tools).toEqual(
      expect.objectContaining({
        source: 'tui-router',
        diagnosticCode: 'tools.registry-unavailable',
        error: '工具注册表不可用',
      }),
    );
  });

  it('routes the stable /? alias through the same localized help Presenter', async () => {
    const result = await handleTuiControlCommand('/?', createContext({ uiLocale: 'zh-cn' }));

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('可用命令：');
    expect(result.output).toContain('/help, /h, /?');
  });

  it('localizes unknown-command chrome without changing the original input', async () => {
    const input = '/missing-command --原始-flag';
    const result = await handleTuiControlCommand(input, createContext({ uiLocale: 'zh-cn' }));

    expect(result).toEqual(
      expect.objectContaining({
        handled: true,
        source: 'tui-router',
        diagnosticCode: 'command.unknown',
        error: `未知命令：${input}。输入 /help 查看可用命令。`,
      }),
    );
  });

  it('localizes model, media and perception output through one zh-cn presentation context', async () => {
    const context = createContext({ uiLocale: 'zh-cn' });

    const model = await handleTuiControlCommand('/model gpt-5.3-codex', context);
    const media = await handleTuiControlCommand('/media image openai:gpt-image-1', context);
    const perception = await handleTuiControlCommand('/perception image auto', context);

    expect(model.output).toBe(
      '对话模型已切换为：anthropic:gpt-5.3-codex (Anthropic / GPT 5.3 Codex)',
    );
    expect(media.output).toBe('图像模型已设为：openai:gpt-image-1 (OpenAI / GPT Image)');
    expect(perception.output).toBe('图像感知模型已设为自动选择。');
  });

  it('routes execution mode commands through the mode port', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/plan', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toBe('Plan mode enabled');
    expect(context.ports.mode?.setExecutionMode).toHaveBeenCalledWith('plan');
  });

  it('routes model switching through the model port', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model gpt-5.3-codex', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toBe(
      'Chat model switched to: anthropic:gpt-5.3-codex (Anthropic / GPT 5.3 Codex)',
    );
    expect(context.ports.model?.selectChatModel).toHaveBeenCalledWith({
      providerId: 'anthropic',
      modelId: 'gpt-5.3-codex',
      providerExpressionProfileId: 'provider-expression:anthropic:gpt-5.3-codex',
      optionId: 'anthropic:gpt-5.3-codex',
      label: 'Anthropic / GPT 5.3 Codex',
      category: 'llm',
    });
  });

  it('rejects invalid model identities visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model missing-provider:missing-model', context);

    expect(result.error).toBe(
      'Unknown chat model identity: missing-provider:missing-model. Use /model chat to list available chat models.',
    );
    expect(context.ports.model?.selectChatModel).not.toHaveBeenCalled();
  });

  it('lists chat and media models through /model status', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model list', context);

    expect(result.output).toContain('Model Selection:');
    expect(result.output).toContain('Current chat model: anthropic:claude-sonnet-4-20250514');
    expect(result.output).toContain('Available chat models:');
    expect(result.output).toContain('anthropic:gpt-5.3-codex  Anthropic / GPT 5.3 Codex');
    expect(result.output).toContain('Media Model Selection:');
    expect(result.output).toContain('Available image models:');
    expect(result.output).toContain('openai:gpt-image-1  OpenAI / GPT Image');
    expect(result.output).toContain('Perception Models:');
    expect(result.output).toContain('image: google:gemini-flash (Google / Gemini Flash)');
    expect(result.output).toContain(
      '/model <image|video|audio> <provider:model|provider/model|model-id|none>',
    );
    expect(result.output).toContain(
      '/model perception <image|video|audio> <provider:model|provider/model|model-id|auto>',
    );
  });

  it('opens the chat model selector for /model chat without a model argument', async () => {
    const context = createContext({
      selectedMenuItem: 'anthropic:gpt-5.3-codex',
      chatModelOptions: [
        {
          id: 'anthropic:gpt-5.3-codex',
          label: 'Anthropic / GPT 5.3 Codex',
          providerId: 'anthropic',
          modelId: 'gpt-5.3-codex',
          providerExpressionProfileId: 'provider-expression:anthropic:gpt-5.3-codex',
          category: 'llm',
        },
      ],
    });

    const result = await handleTuiControlCommand('/model chat', context);

    expect(result.output).toBe(
      'Chat model switched to: anthropic:gpt-5.3-codex (Anthropic / GPT 5.3 Codex)',
    );
    expect(context.ports.model?.selectMenuItem).toHaveBeenCalledWith({
      title: 'Chat Model',
      items: [
        {
          id: 'anthropic:gpt-5.3-codex',
          label: 'Anthropic / GPT 5.3 Codex',
          description: 'anthropic/gpt-5.3-codex',
          active: false,
        },
      ],
    });
    expect(result.output).not.toContain('Usage: /model chat');
  });

  it('opens a media model selector for /model image without a model argument', async () => {
    const context = createContext({
      selectedMenuItem: 'openai:gpt-image-1',
    });

    const result = await handleTuiControlCommand('/model image', context);

    expect(result.output).toBe('image model set to: openai:gpt-image-1 (OpenAI / GPT Image)');
    expect(context.ports.model?.selectMenuItem).toHaveBeenCalledWith({
      title: 'Image Model',
      items: [
        {
          id: 'openai:gpt-image-1',
          label: 'OpenAI / GPT Image',
          description: 'openai/gpt-image-1',
          active: true,
        },
        {
          id: '__none__',
          label: 'None',
          description: 'Disable image generation for this session',
          active: false,
        },
      ],
    });
    expect(context.ports.media?.setMediaModel).toHaveBeenCalledWith('image', {
      providerId: 'openai',
      modelId: 'gpt-image-1',
      providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
      optionId: 'openai:gpt-image-1',
      label: 'OpenAI / GPT Image',
      category: 'image',
    });
    expect(result.output).not.toContain('Usage: /media image');
  });

  it('routes /model media category selection through the media port without exiting', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model image openai:gpt-image-1', context);

    expect(result.source).toBe('tui-router');
    expect(result.continueExecution).toBe(true);
    expect(result.output).toBe('image model set to: openai:gpt-image-1 (OpenAI / GPT Image)');
    expect(context.ports.media?.setMediaModel).toHaveBeenCalledWith('image', {
      providerId: 'openai',
      modelId: 'gpt-image-1',
      providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
      optionId: 'openai:gpt-image-1',
      label: 'OpenAI / GPT Image',
      category: 'image',
    });
    expect(context.ports.model?.selectChatModel).not.toHaveBeenCalled();
    expect(context.ports.lifecycle?.exit).not.toHaveBeenCalled();
  });

  it('routes /model media none selection through the media port', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model video none', context);

    expect(result.source).toBe('tui-router');
    expect(result.continueExecution).toBe(true);
    expect(result.output).toBe('video media generation disabled for this session.');
    expect(context.ports.media?.setMediaModel).toHaveBeenCalledWith('video', 'none');
    expect(context.ports.lifecycle?.exit).not.toHaveBeenCalled();
  });

  it('rejects invalid /model media category identities visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model video openai:gpt-image-1', context);

    expect(result.error).toBe(
      'Unknown video media model identity: openai:gpt-image-1. Use /media video to list available models.',
    );
    expect(context.ports.media?.setMediaModel).not.toHaveBeenCalled();
  });

  it('lists and selects perception model identities through /model perception', async () => {
    const context = createContext();

    const listed = await handleTuiControlCommand('/model perception image status', context);
    const selected = await handleTuiControlCommand(
      '/model perception image google:gemini-flash',
      context,
    );

    expect(listed.output).toContain('image: google:gemini-flash');
    expect(listed.output).toContain('google:gemini-flash  Google / Gemini Flash');
    expect(selected.output).toBe(
      'image perception model set to: google:gemini-flash (Google / Gemini Flash)',
    );
    expect(context.ports.perception?.setPerceptionModel).toHaveBeenCalledWith('image', {
      providerId: 'google',
      modelId: 'gemini-flash',
      providerExpressionProfileId: 'provider-expression:google:gemini-flash',
      optionId: 'google:gemini-flash',
      label: 'Google / Gemini Flash',
      category: 'llm',
      capabilities: ['chat', 'vision', 'vision_video'],
    });
  });

  it('routes /perception auto through perception ports', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/perception image auto', context);

    expect(result.output).toBe('image perception model set to automatic selection.');
    expect(context.ports.perception?.setPerceptionModel).toHaveBeenCalledWith('image', 'auto');
  });

  it('rejects perception models without the requested capability visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/perception audio google:gemini-flash', context);

    expect(result.error).toBe(
      'Unknown audio perception model identity: google:gemini-flash. Use /perception audio to list available models.',
    );
    expect(context.ports.perception?.setPerceptionModel).not.toHaveBeenCalled();
  });

  it('lists and selects explicit media model identities', async () => {
    const context = createContext();

    const listed = await handleTuiControlCommand('/media image status', context);
    const selected = await handleTuiControlCommand('/media image openai:gpt-image-1', context);

    expect(listed.output).toContain('openai:gpt-image-1  OpenAI / GPT Image');
    expect(selected.output).toBe('image model set to: openai:gpt-image-1 (OpenAI / GPT Image)');
    expect(context.ports.media?.setMediaModel).toHaveBeenCalledWith('image', {
      providerId: 'openai',
      modelId: 'gpt-image-1',
      providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
      optionId: 'openai:gpt-image-1',
      label: 'OpenAI / GPT Image',
      category: 'image',
    });
  });

  it('rejects invalid media identities visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/media video openai:gpt-image-1', context);

    expect(result.error).toBe(
      'Unknown video media model identity: openai:gpt-image-1. Use /media video to list available models.',
    );
    expect(context.ports.media?.setMediaModel).not.toHaveBeenCalled();
  });

  it('uses the canonical post-operation model state returned by the owning port', async () => {
    const context = createContext({
      setMediaModel: () => ({
        providerId: 'canonical-provider',
        modelId: 'canonical-model',
        optionId: 'canonical-provider:canonical-model',
        label: 'Canonical Provider Label',
        category: 'image',
      }),
    });

    const result = await handleTuiControlCommand('/media image openai:gpt-image-1', context);

    expect(result.output).toBe(
      'image model set to: canonical-provider:canonical-model (Canonical Provider Label)',
    );
  });

  it('uses canonical post-operation state for chat and perception selections', async () => {
    const context = createContext({
      selectChatModel: () => ({
        providerId: 'canonical-chat',
        modelId: 'selected-model',
        label: 'Canonical Chat',
      }),
      setPerceptionModel: () => ({
        providerId: 'canonical-perception',
        modelId: 'vision-model',
        label: 'Canonical Perception',
      }),
    });

    const chat = await handleTuiControlCommand('/model gpt-5.3-codex', context);
    const perception = await handleTuiControlCommand(
      '/perception image google:gemini-flash',
      context,
    );

    expect(chat.output).toBe(
      'Chat model switched to: canonical-chat:selected-model (Canonical Chat)',
    );
    expect(perception.output).toBe(
      'image perception model set to: canonical-perception:vision-model (Canonical Perception)',
    );
  });

  it('fails visibly when a migrated side-effect port violates the post-state contract', async () => {
    const context = createContext({
      selectChatModel: (() => undefined) as never,
      setMediaModel: (() => undefined) as never,
      setPerceptionModel: (() => undefined) as never,
    });

    await expect(handleTuiControlCommand('/model gpt-5.3-codex', context)).rejects.toThrow();
    await expect(
      handleTuiControlCommand('/media image openai:gpt-image-1', context),
    ).rejects.toThrow();
    await expect(
      handleTuiControlCommand('/perception image google:gemini-flash', context),
    ).rejects.toThrow();
  });

  it('does not retain a second media mutation success path without canonical ports', async () => {
    const context = createContext();
    const withoutCanonicalMediaPorts: TuiCommandRouterContext = {
      ...context,
      ports: { ...context.ports, media: undefined },
    };

    const selected = await handleTuiControlCommand(
      '/media image openai:gpt-image-1',
      withoutCanonicalMediaPorts,
    );
    const reset = await handleTuiControlCommand('/media reset', withoutCanonicalMediaPorts);

    expect(selected.error).toBe('Media model selection is not available for this session.');
    expect(reset.error).toBe('Media model reset is not available for this session.');
  });

  it('rejects a non-empty reset post-state as a canonical contract violation', async () => {
    const context = createContext({
      resetMediaModels: () => ({ image: 'still-configured' }),
      resetPerceptionModels: () => ({ video: 'still-configured' }),
    });

    await expect(handleTuiControlCommand('/media reset', context)).rejects.toThrow(
      'media reset port returned a non-empty canonical post-operation state',
    );
    await expect(handleTuiControlCommand('/perception reset', context)).rejects.toThrow(
      'perception reset port returned a non-empty canonical post-operation state',
    );
  });

  it('wraps provider failures in localized owned diagnostics without translating external detail', async () => {
    const context = createContext({
      uiLocale: 'zh-cn',
      setMediaModel: () => {
        throw new Error('PROVIDER_DETAIL_NO_TRANSLATE');
      },
    });

    const result = await handleTuiControlCommand('/media image openai:gpt-image-1', context);

    expect(result.error).toBe('更新图像媒体模型失败。: PROVIDER_DETAIL_NO_TRANSLATE');
  });

  it('uses reset-specific diagnostics without fabricating a media category', async () => {
    const mediaContext = createContext({
      uiLocale: 'zh-cn',
      resetMediaModels: () => {
        throw new Error('MEDIA_RESET_DETAIL');
      },
    });
    const perceptionContext = createContext({
      uiLocale: 'zh-cn',
      resetPerceptionModels: () => {
        throw new Error('PERCEPTION_RESET_DETAIL');
      },
    });

    const media = await handleTuiControlCommand('/media reset', mediaContext);
    const perception = await handleTuiControlCommand('/perception reset', perceptionContext);

    expect(media.error).toBe('重置媒体模型失败。: MEDIA_RESET_DETAIL');
    expect(perception.error).toBe('重置感知模型失败。: PERCEPTION_RESET_DETAIL');
  });

  it('fails visibly when canonical presentation wiring is missing', async () => {
    const context = createContext();

    await expect(
      handleTuiControlCommand('/model status', {
        ...context,
        presentation: undefined as never,
      }),
    ).rejects.toThrow('AgentTerminalPresentationContext is required by the TUI command router.');
  });

  it('validates and applies LLM parameters through the parameter port', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/param set reasoning deep', context);

    expect(result.output).toBe(
      'Parameter updated: reasoning = deep\nApplied parameters:\n  thinkingBudget = 12000',
    );
    expect(context.ports.parameters?.validate).toHaveBeenCalledWith({ reasoningPreset: 'deep' });
    expect(context.ports.parameters?.apply).toHaveBeenCalledWith({
      config: { reasoningPreset: 'deep' },
      chatOptions: { thinkingBudget: 12000 },
      providerOptions: {},
    });
  });

  it('rejects unsupported parameters visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/param set imaginary true', context);

    expect(result.error).toContain('Unsupported parameter: imaginary');
    expect(context.ports.parameters?.validate).not.toHaveBeenCalled();
  });

  it('localizes typed LLM projection diagnostics without using platform prose', async () => {
    const context = createContext({
      uiLocale: 'zh-cn',
      parameterValidate: vi.fn((config): TuiParameterValidationResult => ({
        config,
        diagnostics: [
          { code: 'unsupported-thinking-budget', field: 'thinkingBudget' },
          { code: 'provider-not-configured', providerId: 'provider-原文' },
        ],
      })),
    });

    const result = await handleTuiControlCommand('/param set reasoning deep', context);

    expect(result).toEqual(
      expect.objectContaining({
        diagnosticCode: 'parameter.validation-failed',
        error:
          '参数校验失败\n所选模型或提供商不支持 thinking budget 参数：thinkingBudget\n提供商 "provider-原文" 未配置。',
      }),
    );
    expect(result.error).not.toContain('Selected model');
  });

  it('shows and changes session mode through the mode port', async () => {
    const context = createContext();

    const status = await handleTuiControlCommand('/mode', context);
    const changed = await handleTuiControlCommand('/mode image', context);

    expect(status.output).toContain('Session mode: agent');
    expect(status.output).toContain('agent, image, video, audio');
    expect(changed.output).toBe('Session mode set to: image');
    expect(context.ports.mode?.setSessionMode).toHaveBeenCalledWith('image');
  });

  it('rejects unsupported session modes visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/mode music', context);

    expect(result.error).toBe('Unsupported session mode: music. Valid: agent, image, video, audio');
    expect(context.ports.mode?.setSessionMode).not.toHaveBeenCalled();
  });

  it('fails visibly when the canonical status snapshot provider is missing', async () => {
    const context = createContext();

    await expect(
      handleTuiControlCommand('/status', {
        ...context,
        ports: { ...context.ports, status: undefined },
      }),
    ).rejects.toThrow('TUI status snapshot provider is required by the canonical status path.');
  });

  it('delegates status rendering to the canonical semantic snapshot Presenter', async () => {
    const context = createContext({
      getTokenCount: vi.fn(() => 321),
    });

    const result = await handleTuiControlCommand('/status', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('Model: anthropic:claude-sonnet-4-20250514');
    expect(result.output).toContain('Session: agent');
    expect(result.output).toContain('Mode: auto');
    expect(result.output).toContain('Media (image): openai:gpt-image-1');
    expect(result.output).toContain('Parameter (reasoning): deep');
    expect(result.output).toContain('Context tokens: 321');
    expect(result.output).toContain('User config: /Users/neko/.neko/config.toml');
  });

  it('lists background tasks through the task port', async () => {
    const context = createContext({
      tasks: [
        createTask({
          id: 'task_1783527068036_1',
          status: 'running',
          progress: 35,
          payload: {
            prompt: '猫咪玩耍',
            providerId: 'nekoapi-media',
          },
          lifecycle: {
            ownerConversationId: 'conversation-1',
            runMode: 'background',
          },
        }),
      ],
    });

    const result = await handleTuiControlCommand('/tasks', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('Tasks:');
    expect(result.output).toContain('task_1783527068036_1');
    expect(result.output).toContain('running');
    expect(result.output).toContain('35%');
    expect(result.output).toContain('猫咪玩耍');
  });

  it('omits an unavailable optional context token row without fallback prose', async () => {
    const context = createContext({ getTokenCount: undefined });

    const result = await handleTuiControlCommand('/status', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).not.toContain('Context tokens:');
    expect(result.output).not.toContain('unavailable');
  });

  it('returns a localized semantic diagnostic when a queue operation port is absent', async () => {
    const queue = createAgentConversationMessageQueue({ conversationId: 'conv-queue-port' });
    queue.enqueue({ content: '排队内容', source: 'user' });
    const context = createContext({ queue, uiLocale: 'zh-cn' });

    const result = await handleTuiControlCommand('/queue promote queue-1', {
      ...context,
      ports: {
        ...context.ports,
        queue: { getSnapshot: () => queue.snapshot() },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        diagnosticCode: 'queue.operation-unavailable',
        error: '当前会话不支持队列操作：promote',
      }),
    );
  });

  it('runs compact through the context compaction port', async () => {
    const compact = vi.fn(async () => ({
      originalTokens: 1000,
      compressedTokens: 250,
      ratio: 0.25,
    }));
    const context = createContext({ compact });

    const result = await handleTuiControlCommand('/compact', context);

    expect(result.source).toBe('tui-router');
    expect(compact).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Context compressed: 1000 -> 250 tokens (25.0%)');
  });

  it('returns visible diagnostics when compaction port is missing', async () => {
    const context = createContext({ compact: undefined });

    const result = await handleTuiControlCommand('/compact', context);

    expect(result.source).toBe('tui-router');
    expect(result.error).toBe('Context compaction is not available for this session.');
  });

  it('lists and mutates queued messages through the queue port', async () => {
    const queue = createAgentConversationMessageQueue({
      conversationId: 'conv-1',
      now: () => 1000,
    });
    const first = queue.enqueue({ content: 'first', source: 'user' });
    const second = queue.enqueue({ content: 'second', source: 'user' });
    const context = createContext({ queue });

    const listed = await handleTuiControlCommand('/queue list', context);
    const promoted = await handleTuiControlCommand(`/queue promote ${second.id}`, context);
    const sentNext = await handleTuiControlCommand(`/queue send-next ${first.id}`, context);
    const sentNow = await handleTuiControlCommand(`/queue send-now ${first.id}`, context);
    const edited = await handleTuiControlCommand(`/queue edit ${first.id} first revised`, context);
    const cancelled = await handleTuiControlCommand(`/queue cancel ${second.id}`, context);

    expect(listed.output).toContain('Queue: 2 pending');
    expect(promoted.output).toBe(
      `Queued message scheduled as next eligible user message: ${second.id}`,
    );
    expect(sentNext.output).toBe(
      `Queued message scheduled as next eligible user message: ${first.id}`,
    );
    expect(sentNow.error).toBe(
      'The send-now command cannot interrupt the active turn. Use /queue send-next <id> or /queue promote <id>.',
    );
    expect(edited.output).toBe(`Queued message edited: ${first.id}`);
    expect(cancelled.output).toBe(`Queued message cancelled: ${second.id}`);
    expect(queue.snapshot().items).toEqual([
      expect.objectContaining({ id: first.id, content: 'first revised' }),
    ]);
  });

  it('reports stale queue item diagnostics visibly', async () => {
    const queue = createAgentConversationMessageQueue({ conversationId: 'conv-1' });
    const context = createContext({ queue });

    const result = await handleTuiControlCommand('/queue cancel missing', context);

    expect(result.error).toBe(
      'Queue operation failed (stale-item): Queued message is no longer pending: missing',
    );
  });

  it('lists MCP server connection status', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/mcp', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('MCP Servers:');
    expect(result.output).toContain('filesystem  connected  transport=stdio  tools=2');
    expect(result.output).toContain('asset-library  disconnected  transport=http  tools=0');
    expect(result.output).toContain('disabled-server  disabled');
  });

  it('lists MCP tools globally and by server', async () => {
    const context = createContext();

    const all = await handleTuiControlCommand('/mcp tools', context);
    const scoped = await handleTuiControlCommand('/mcp tools filesystem', context);

    expect(all.output).toContain('MCP Tools:');
    expect(all.output).toContain('mcp__filesystem__read_file');
    expect(scoped.output).toContain('MCP Tools for filesystem:');
    expect(scoped.output).toContain('mcp__filesystem__search');
  });

  it('routes MCP connect, disconnect, and reconnect through MCP ports', async () => {
    const context = createContext();

    const connected = await handleTuiControlCommand('/mcp connect asset-library', context);
    const disconnected = await handleTuiControlCommand('/mcp disconnect filesystem', context);
    const reconnected = await handleTuiControlCommand('/mcp reconnect filesystem', context);

    expect(connected.output).toBe('MCP server connected: asset-library');
    expect(disconnected.output).toBe('MCP server disconnected: filesystem');
    expect(reconnected.output).toBe('MCP server reconnected: filesystem');
    expect(context.ports.mcp?.connect).toHaveBeenCalledWith('asset-library');
    expect(context.ports.mcp?.disconnect).toHaveBeenCalledWith('filesystem');
    expect(context.ports.mcp?.reconnect).toHaveBeenCalledWith('filesystem');
  });

  it('reports MCP diagnostics visibly', async () => {
    const missingPorts = createContext({ mcp: undefined });
    const context = createContext();

    const unavailable = await handleTuiControlCommand('/mcp', missingPorts);
    const unknown = await handleTuiControlCommand('/mcp connect missing', context);
    const disabled = await handleTuiControlCommand('/mcp connect disabled-server', context);

    expect(unavailable.error).toBe('MCP controls are not available for this session.');
    expect(unknown.error).toBe('Unknown MCP server: missing');
    expect(disabled.error).toBe('MCP server is disabled: disabled-server');
  });

  it('lists capability providers and diagnostics', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/capability', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('TUI Capability Providers:');
    expect(result.output).toContain('neko-assets  loaded  loaded=1 skipped=0');
    expect(result.output).toContain('neko-cut  skipped  loaded=0 skipped=1');
    expect(result.output).toContain('Capability Diagnostics:');
    expect(result.output).toContain('warn neko-cut provider: host-not-supported');
  });

  it('shows one capability provider and lists capability tools', async () => {
    const context = createContext();

    const shown = await handleTuiControlCommand('/capability show neko-assets', context);
    const allTools = await handleTuiControlCommand('/capability tools', context);
    const scopedTools = await handleTuiControlCommand('/capability tools neko-assets', context);

    expect(shown.output).toContain('Capability Provider: neko-assets');
    expect(shown.output).toContain('tool  assets.list');
    expect(allTools.output).toContain('Capability Tools:');
    expect(allTools.output).toContain('assets.list');
    expect(scopedTools.output).toContain('Capability Tools for neko-assets:');
    expect(scopedTools.output).toContain('assets.list');
  });

  it('reports unavailable capability diagnostics visibly', async () => {
    const missingPorts = createContext({ capability: undefined });
    const context = createContext();

    const unavailable = await handleTuiControlCommand('/capability', missingPorts);
    const unknown = await handleTuiControlCommand('/capability show missing', context);

    expect(unavailable.error).toBe('Capability diagnostics are not available for this session.');
    expect(unknown.error).toBe('Unknown capability provider: missing');
  });

  it('lists, shows, opens, and sends artifact references through artifact ports', async () => {
    const artifact = {
      id: 'asset-img-1',
      kind: 'image' as const,
      assetId: 'asset-img-1',
      path: 'neko/generated/shot-01.png',
      dimensions: '1024x1024',
      diagnostics: [],
      commands: ['/artifact show asset-img-1'],
    };
    const ports: TuiArtifactPorts = {
      list: vi.fn(() => [artifact]),
      show: vi.fn((id) => (id === artifact.assetId ? artifact : null)),
      open: vi.fn(),
      send: vi.fn(),
    };
    const context = createContext({ artifact: ports });

    const listed = await handleTuiControlCommand('/artifact list', context);
    const shown = await handleTuiControlCommand('/artifact show asset-img-1', context);
    const opened = await handleTuiControlCommand('/artifact open asset-img-1', context);
    const sent = await handleTuiControlCommand('/artifact send canvas asset-img-1', context);

    expect(listed.output).toContain('asset-img-1  image  neko/generated/shot-01.png  1024x1024');
    expect(shown.output).toContain('Image reference');
    expect(opened.output).toBe('Artifact open requested: asset-img-1');
    expect(sent.output).toBe('Artifact asset-img-1 sent to canvas');
    expect(ports.open).toHaveBeenCalledWith('asset-img-1');
    expect(ports.send).toHaveBeenCalledWith('canvas', 'asset-img-1');
  });

  it('reports unavailable artifact host actions visibly', async () => {
    const context = createContext({ artifact: {} });

    const list = await handleTuiControlCommand('/artifact list', context);
    const show = await handleTuiControlCommand('/artifact show asset-img-1', context);
    const open = await handleTuiControlCommand('/artifact open asset-img-1', context);
    const send = await handleTuiControlCommand('/artifact send canvas asset-img-1', context);

    expect(list.error).toBe('Artifact listing is not available for this session.');
    expect(show.error).toBe('Artifact details are not available for this session.');
    expect(open.error).toBe('Artifact open is not available for this session.');
    expect(send.error).toBe('Artifact send is not available for this session.');
  });

  it('rejects the removed marketplace command visibly', async () => {
    const result = await handleTuiControlCommand('/market', createContext({ uiLocale: 'zh-cn' }));

    expect(result.source).toBe('tui-router');
    expect(result.output).toBeUndefined();
    expect(result.error).toContain('/market');
  });

  it('routes config updates through the canonical callback and localized presenter', async () => {
    const onConfigUpdate = vi.fn();
    const base = createContext({ uiLocale: 'zh-cn' });
    const context: TuiCommandRouterContext = {
      ...base,
      slash: { ...base.slash, onConfigUpdate },
    };

    const result = await handleTuiControlCommand('/config set maxTokens 2048', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toBe('已设置 maxTokens = 2048');
    expect(onConfigUpdate).toHaveBeenCalledWith({ maxTokens: 2048 });
  });

  it('fails visibly instead of reporting a config update when the callback is unavailable', async () => {
    const result = await handleTuiControlCommand(
      '/config set model external-model',
      createContext(),
    );

    expect(result.source).toBe('tui-router');
    expect(result.diagnosticCode).toBe('config.update-unavailable');
    expect(result.output).toBeUndefined();
  });

  it('resumes a full conversation through the canonical router without rewriting history', async () => {
    const record = {
      id: 'conv-原文',
      title: 'Storyboard 原标题',
      updatedAt: Date.UTC(2026, 6, 11, 4, 5, 6),
      messageCount: 1,
    };
    const conversationCatalog = { list: vi.fn(), get: vi.fn().mockResolvedValue(record) };
    const onResumeConversation = vi.fn();
    const base = createContext({ uiLocale: 'zh-cn' });
    const context: TuiCommandRouterContext = {
      ...base,
      slash: {
        ...base.slash,
        conversationCatalog,
        onResumeConversation,
      },
    };

    const result = await handleTuiControlCommand('/resume conv-原文', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('已恢复：“Storyboard 原标题”');
    expect(onResumeConversation).toHaveBeenCalledWith(record.id);
  });

  it('wraps conversation storage failures without translating external detail', async () => {
    const conversationCatalog = {
      get: vi.fn(),
      list: vi.fn().mockRejectedValue(new Error('EACCES external-detail 原文')),
    };
    const base = createContext({ uiLocale: 'zh-cn' });
    const context: TuiCommandRouterContext = {
      ...base,
      slash: { ...base.slash, conversationCatalog },
    };

    const result = await handleTuiControlCommand('/resume', context);

    expect(result.source).toBe('tui-router');
    expect(result.diagnosticCode).toBe('resume.storage-failed');
    expect(result.error).toBe('读取对话存储失败：EACCES external-detail 原文');
  });

  it('localizes history roles while preserving custom message previews', async () => {
    const base = createContext({ uiLocale: 'zh-cn' });
    const context: TuiCommandRouterContext = {
      ...base,
      slash: {
        ...base.slash,
        getHistory: () => [
          { role: 'user', content: 'custom-content 原文' },
          { role: 'tool', content: [{ type: 'text', text: 'structured' }] },
        ],
      },
    };

    const result = await handleTuiControlCommand('/history', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('你：custom-content 原文');
    expect(result.output).toContain('工具：[工具/结构化内容]');
  });
});

function createContext(
  overrides: {
    readonly getTokenCount?: (() => number) | undefined;
    readonly compact?:
      | (() => Promise<{
          readonly originalTokens: number;
          readonly compressedTokens: number;
          readonly ratio: number;
        }>)
      | undefined;
    readonly skills?: readonly Record<string, unknown>[];
    readonly chatModelOptions?: readonly ChatModelOption[];
    readonly mediaModelOptions?: readonly ChatModelOption[];
    readonly selectedMenuItem?: string | null;
    readonly queue?: ReturnType<typeof createAgentConversationMessageQueue>;
    readonly tasks?: readonly Task[];
    readonly mcp?: TuiCommandRouterContext['ports']['mcp'];
    readonly capability?: TuiCapabilityPorts;
    readonly artifact?: TuiArtifactPorts;
    readonly uiLocale?: 'en' | 'zh-cn';
    readonly parameterValidate?: NonNullable<
      TuiCommandRouterContext['ports']['parameters']
    >['validate'];
    readonly selectChatModel?: TuiCommandRouterContext['ports']['model'] extends infer Ports
      ? Ports extends { selectChatModel?: infer Select }
        ? Select
        : never
      : never;
    readonly setMediaModel?: TuiCommandRouterContext['ports']['media'] extends infer Ports
      ? Ports extends { setMediaModel?: infer SetModel }
        ? SetModel
        : never
      : never;
    readonly resetMediaModels?: TuiCommandRouterContext['ports']['media'] extends infer Ports
      ? Ports extends { resetMediaModels?: infer Reset }
        ? Reset
        : never
      : never;
    readonly setPerceptionModel?: TuiCommandRouterContext['ports']['perception'] extends infer Ports
      ? Ports extends { setPerceptionModel?: infer SetModel }
        ? SetModel
        : never
      : never;
    readonly resetPerceptionModels?: TuiCommandRouterContext['ports']['perception'] extends infer Ports
      ? Ports extends { resetPerceptionModels?: infer Reset }
        ? Reset
        : never
      : never;
  } = {},
): TuiCommandRouterContext {
  const skills = overrides.skills ?? [
    {
      name: 'review',
      description: 'Review changes',
      content: 'Review instructions',
      enabled: true,
    },
  ];
  const chatModelOptions = overrides.chatModelOptions ?? [
    {
      id: 'anthropic:gpt-5.3-codex',
      label: 'Anthropic / GPT 5.3 Codex',
      providerId: 'anthropic',
      modelId: 'gpt-5.3-codex',
      providerExpressionProfileId: 'provider-expression:anthropic:gpt-5.3-codex',
      category: 'llm',
    },
    {
      id: 'google:gemini-flash',
      label: 'Google / Gemini Flash',
      providerId: 'google',
      modelId: 'gemini-flash',
      providerExpressionProfileId: 'provider-expression:google:gemini-flash',
      category: 'llm',
      capabilities: ['chat', 'vision', 'vision_video'],
    },
    {
      id: 'google:gemini-audio',
      label: 'Google / Gemini Audio',
      providerId: 'google',
      modelId: 'gemini-audio',
      category: 'llm',
      capabilities: ['chat', 'audio'],
    },
  ];
  const mediaModelOptions = overrides.mediaModelOptions ?? [
    {
      id: 'openai:gpt-image-1',
      label: 'OpenAI / GPT Image',
      providerId: 'openai',
      modelId: 'gpt-image-1',
      providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
      category: 'image',
    },
    {
      id: 'runway:gen-4',
      label: 'Runway / Gen 4',
      providerId: 'runway',
      modelId: 'gen-4',
      category: 'video',
    },
  ];
  const uiLocale = overrides.uiLocale ?? 'en';
  return {
    presentation: createAgentTerminalPresentationContext({
      translator: createStrictTranslator(uiLocale, [
        AGENT_COMMAND_MESSAGE_SOURCE,
        CLI_TERMINAL_MESSAGE_SOURCE,
      ] as const),
      formatters: { count: String, dateTime: String, duration: String, bytes: String },
    }),
    slash: {
      locale: uiLocale,
      config: {
        ...DEFAULT_CLI_CONFIG,
        defaultMediaModels: {
          image: 'openai:gpt-image-1',
        },
        perceptionModels: {
          image: 'google:gemini-flash',
        },
        llmConfig: {
          reasoningPreset: 'deep',
        },
      },
    },
    ports: {
      output: {
        info: vi.fn(),
        error: vi.fn(),
      },
      history: {
        clear: vi.fn(),
      },
      lifecycle: {
        exit: vi.fn(),
      },
      mode: {
        setExecutionMode: vi.fn(),
        getSessionMode: vi.fn((): TuiSessionMode => 'agent'),
        setSessionMode: vi.fn(),
      },
      model: {
        selectChatModel: vi.fn(
          overrides.selectChatModel ??
            ((model) =>
              typeof model === 'string'
                ? { providerId: 'anthropic', modelId: model, optionId: `anthropic:${model}` }
                : model),
        ),
        listChatModels: vi.fn(() => ['gpt-5.3-codex']),
        listChatModelOptions: vi.fn(() => chatModelOptions),
        selectMenuItem: vi.fn(async () => overrides.selectedMenuItem ?? null),
      },
      media: {
        listMediaModelOptions: vi.fn(() => mediaModelOptions),
        getCurrentMediaModels: vi.fn(() => ({ image: 'openai:gpt-image-1' })),
        setMediaModel: vi.fn(overrides.setMediaModel ?? ((_category, model) => model)),
        resetMediaModels: vi.fn(overrides.resetMediaModels ?? (() => ({}))),
      },
      perception: {
        listPerceptionModelOptions: vi.fn(() => chatModelOptions),
        getCurrentPerceptionModels: vi.fn(() => ({ image: 'google:gemini-flash' })),
        setPerceptionModel: vi.fn(overrides.setPerceptionModel ?? ((_category, model) => model)),
        resetPerceptionModels: vi.fn(overrides.resetPerceptionModels ?? (() => ({}))),
      },
      parameters: {
        getConfig: vi.fn(() => ({ reasoningPreset: 'deep' as const })),
        validate: vi.fn(
          overrides.parameterValidate ??
            ((config) => ({
              config,
              chatOptions: config.reasoningPreset === 'deep' ? { thinkingBudget: 12000 } : {},
              providerOptions: {},
            })),
        ),
        apply: vi.fn(),
      },
      skill: {
        listEnabled: vi.fn(() =>
          skills.map((skill) => ({
            name: String(skill['name']),
            description:
              typeof skill['description'] === 'string' ? skill['description'] : undefined,
          })),
        ),
        execute: vi.fn(() => true),
      },
      context: {
        compact: overrides.compact,
      },
      queue: overrides.queue
        ? {
            getSnapshot: () => overrides.queue!.snapshot(),
            promote: (queueItemId) => overrides.queue!.promote(queueItemId),
            cancel: (queueItemId) => overrides.queue!.remove(queueItemId),
            edit: (queueItemId, content) => overrides.queue!.edit(queueItemId, content),
          }
        : undefined,
      task: overrides.tasks
        ? {
            list: vi.fn(() => overrides.tasks!),
          }
        : undefined,
      mcp:
        overrides.mcp === undefined && 'mcp' in overrides
          ? undefined
          : (overrides.mcp ?? {
              listServers: vi.fn(() => [
                {
                  id: 'filesystem',
                  name: 'filesystem',
                  enabled: true,
                  connected: true,
                  transport: 'stdio',
                  toolCount: 2,
                },
                {
                  id: 'asset-library',
                  name: 'Asset Library',
                  enabled: true,
                  connected: false,
                  transport: 'http',
                  toolCount: 0,
                },
                {
                  id: 'disabled-server',
                  name: 'Disabled Server',
                  enabled: false,
                  connected: false,
                  transport: 'stdio',
                  toolCount: 0,
                },
              ]),
              listTools: vi.fn((serverId?: string) => {
                const tools = [
                  'mcp__filesystem__read_file',
                  'mcp__filesystem__search',
                  'mcp__asset-library__lookup',
                ];
                return serverId
                  ? tools.filter((tool) => tool.startsWith(`mcp__${serverId}__`))
                  : tools;
              }),
              connect: vi.fn(),
              disconnect: vi.fn(),
              reconnect: vi.fn(),
            }),
      capability:
        overrides.capability === undefined && 'capability' in overrides
          ? undefined
          : (overrides.capability ??
            ({
              getProviderSummaries: vi.fn(
                (): ReturnType<TuiCapabilityPorts['getProviderSummaries']> => [
                  {
                    providerId: 'neko-assets',
                    version: '1.0.0',
                    loaded: [{ kind: 'tool' as const, name: 'assets.list' }],
                    skipped: [],
                  },
                  {
                    providerId: 'neko-cut',
                    version: '1.0.0',
                    loaded: [],
                    skipped: [
                      {
                        level: 'warn' as const,
                        providerId: 'neko-cut',
                        contributionKind: 'provider' as const,
                        code: 'capability.provider.host-not-supported',
                        reason: 'host-not-supported',
                        message: 'Provider is not TUI-safe.',
                        host: 'tui',
                      },
                    ],
                  },
                ],
              ),
              getDiagnostics: vi.fn((): ReturnType<TuiCapabilityPorts['getDiagnostics']> => [
                {
                  level: 'warn' as const,
                  providerId: 'neko-cut',
                  contributionKind: 'provider' as const,
                  code: 'capability.provider.host-not-supported',
                  reason: 'host-not-supported',
                  message: 'Provider is not TUI-safe.',
                  host: 'tui',
                },
              ]),
              listTools: vi.fn((providerId?: string): readonly string[] =>
                providerId === undefined || providerId === 'neko-assets' ? ['assets.list'] : [],
              ),
            } satisfies TuiCapabilityPorts)),
      artifact: overrides.artifact,
      status: {
        getSnapshot: vi.fn(() => ({
          config: {
            ...DEFAULT_CLI_CONFIG,
            chatModel: {
              providerId: 'anthropic',
              modelId: 'claude-sonnet-4-20250514',
            },
            defaultMediaModels: { image: 'openai:gpt-image-1' },
            perceptionModels: { image: 'google:gemini-flash' },
            llmConfig: { reasoningPreset: 'deep' as const },
          },
          execution: {
            sessionMode: 'agent' as TuiSessionMode,
            executionMode: 'auto' as TuiExecutionMode,
            status: 'idle' as const,
          },
          usage: { input: 20, output: 22, total: 42 },
          ...(overrides.getTokenCount === undefined
            ? {}
            : { contextTokenCount: overrides.getTokenCount() }),
          activeSkills: overrides.activeRecords ?? [],
          ...(overrides.queue === undefined ? {} : { messageQueue: overrides.queue.snapshot() }),
          ...(overrides.tasks?.[0] === undefined ? {} : { runningTask: overrides.tasks[0] }),
          userConfigPath: '/Users/neko/.neko/config.toml',
        })),
      },
    },
  };
}

function createTask(overrides: {
  readonly id: string;
  readonly status: Task['status'];
  readonly progress: number;
  readonly payload?: Record<string, unknown>;
  readonly lifecycle?: Partial<NonNullable<Task['lifecycle']>>;
}): Task {
  return {
    scope: {
      conversationId: 'conversation-1',
      runId: 'run-1',
      parentRunId: 'run-1',
      childRunId: overrides.id,
      childKind: 'task',
    },
    id: overrides.id,
    type: 'image_generation',
    status: overrides.status,
    input: {
      type: 'image_generation',
      payload: overrides.payload ?? {},
      ...(overrides.lifecycle ? { lifecycle: overrides.lifecycle } : {}),
    },
    progress: overrides.progress,
    createdAt: 1,
    updatedAt: 2,
    ...(overrides.lifecycle
      ? {
          lifecycle: {
            runMode: 'foreground',
            costPhase: 'idle',
            interruptPolicy: 'cancel-with-agent',
            recoverPolicy: 'retry-executor',
            ...overrides.lifecycle,
          },
        }
      : {}),
  };
}
