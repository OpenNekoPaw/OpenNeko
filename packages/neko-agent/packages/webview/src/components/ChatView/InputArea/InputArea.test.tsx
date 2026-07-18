import { fireEvent, render, screen, within } from '@testing-library/react';
import { cloneElement, isValidElement, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentContextPayload, ChatModelOption, MessageAttachment } from '@neko/shared';
import type { ConversationKind, MediaUnderstandingModels, SessionMode } from '@neko-agent/types';
import { InputAreaProvider } from '@/components/ChatView/InputAreaContext';
import { DEFAULT_COMPOSER_MENU_STATE, DEFAULT_GENERATION_PARAMS } from './types';
import { InputArea } from './InputArea';

const vscodeMocks = vi.hoisted(() => ({
  invokeSkill: vi.fn(),
  confirmRoleplayCandidate: vi.fn(),
  startCharacterDialogueFromSlash: vi.fn(),
}));

vi.mock('@/messages', () => ({
  AgentHostMessages: vscodeMocks,
  VSCodeMessages: vscodeMocks,
}));

const translations: Record<string, string> = {
  'chat.input.control.mode': '模式与模型',
  'chat.input.control.params': '工具参数',
  'chat.input.placeholder': '输入任何问题...',
  'chat.input.thinkingPlaceholder': '正在回答... 请等待或取消后再发送',
  'chat.input.attach': '添加附件',
  'chat.input.attachFile': '添加附件',
  'chat.input.send': '发送',
  'chat.input.queue': '加入队列',
  'chat.input.skills': '技能',
  'chat.input.queuePlaceholder': '正在回答... {count} 条排队消息待处理',
  'chat.input.queuedMessages': '消息队列（{count} 条待处理）',
  'chat.input.queueItemLabel': '排队消息 {index}',
  'chat.input.queueSendNext': '设为下一条发送',
  'chat.input.queueCancel': '取消排队消息',
  'chat.input.queueEdit': '重新编辑排队消息',
  'chat.input.queueExpand': '展开',
  'chat.input.queueCollapse': '收起',
  'chat.input.queueMore': '还有 {count} 条',
  'chat.input.queueAwaitingSnapshot': '正在同步队列...',
  'chat.input.cancel': '取消 (Esc)',
  'chat.input.commands': '命令',
  'chat.input.canvasContext.kicker': '画布选中上下文',
  'chat.input.canvasContext.multiTitle': '已选 {count} 个画布节点',
  'chat.input.canvasContext.counts': '画布选中统计',
  'chat.input.canvasContext.count.shots': '{count} 个镜头',
  'chat.input.canvasContext.count.scenes': '{count} 个场景',
  'chat.input.canvasContext.more': '+{count} 个',
  'chat.input.canvasContext.action.batchGenerate': '批量生成',
  'chat.input.canvasContext.action.optimize': '优化节点',
  'chat.input.canvasContext.action.understand': '询问 Agent',
  'chat.input.canvasContext.prompt.batchGenerate': '为选中的画布镜头批量生成图片。',
  'chat.input.canvasContext.prompt.optimize': '优化选中的画布节点，让分镜结构和视觉提示词更清晰。',
  'chat.input.canvasContext.prompt.understand': '分析选中的画布节点，并建议下一步可执行动作。',
  'chat.entryPrompt.generateAssets.hint':
    '选择素材生成模式，然后在输入框描述要生成的画面、视频或声音。',
  'chat.entryPrompt.generateAssets.section': '素材类型',
  'chat.entryPrompt.generateAssets.empty': '未配置可用的媒体生成模型。',
  'chat.entryPrompt.generateAssets.count': '{count} 个模型',
  'chat.entryPrompt.roleplay.hint': '选择可用的统一实体，进入角色扮演对话。',
  'chat.entryPrompt.roleplay.section': '可扮演角色',
  'chat.entryPrompt.roleplay.empty': '未找到可用于角色扮演的角色实体。',
  'chat.entryPrompt.roleplay.badge': '角色',
  'chat.entryPrompt.roleplay.confirmBadge': '确认并扮演',
  'chat.autoMode': '自动',
  'chat.selectModel': '选择模型',
  'chat.noModelsAvailable': '无可用模型',
  'chat.categoryChat': '对话',
  'chat.modelSource.custom': '自定义',
  'chat.modelConnection.direct': '直连',
  'chat.modelConnection.gateway': '中转',
  'chat.modelCategory.llm': '对话',
  'chat.modelCategory.image': '图像',
  'chat.modelCategory.video': '视频',
  'chat.modelCategory.audio': '音频',
  'chat.modelCapability.vision': '视觉',
  'chat.modelCapability.tools': '工具',
  'chat.modelCapability.streaming': '流式',
  'chat.modelCapability.json': 'JSON',
  'chat.modelCapability.code': '代码',
  'chat.modelCapability.text_to_image': '文生图',
  'chat.modelCapability.text_to_video': '文生视频',
  'chat.modelCapability.text_to_audio': '文生音频',
  'chat.sessionMode.sections.agent': 'Agent 直接协作',
  'chat.sessionMode.sections.media': '媒体生成',
  'chat.sessionMode.agent': 'Agent 创作协作',
  'chat.sessionMode.agentDesc': '直接完善故事主题、角色设定、世界观、场景氛围和创意方向。',
  'chat.sessionMode.short.agent': 'Agent',
  'chat.sessionMode.summary.agent': '完善故事主题、角色设定、世界观和场景氛围。',
  'chat.sessionMode.image': '图片生成',
  'chat.sessionMode.imageDesc': '产出角色图、场景参考、关键帧和风格探索图。',
  'chat.sessionMode.short.image': '图片',
  'chat.sessionMode.summary.image': '产出角色图、场景参考和关键帧。',
  'chat.sessionMode.video': '视频生成',
  'chat.sessionMode.videoDesc': '产出视频素材、动作预览和氛围视频。',
  'chat.sessionMode.short.video': '视频',
  'chat.sessionMode.summary.video': '产出视频素材、动作预览和氛围视频。',
  'chat.sessionMode.audio': '声音生成',
  'chat.sessionMode.audioDesc': '产出配音、音效和环境声。',
  'chat.sessionMode.short.audio': '音频',
  'chat.sessionMode.summary.audio': '产出配音、音效和环境声。',
  'chat.sessionMode.badge.agent': '对话',
  'chat.sessionMode.badge.image': '图片',
  'chat.sessionMode.badge.video': '视频',
  'chat.sessionMode.badge.audio': '声音',
  'chat.generation.category.image': '图片',
  'chat.generation.category.video': '视频',
  'chat.generation.category.audio': '音频',
  'chat.generation.model.none': '不使用',
  'chat.generation.model.noneShort': '无',
  'chat.generation.model.select': '选择{category}模型',
  'chat.generation.model.unconfigured': '未配置{category}模型',
  'chat.mediaUnderstanding.chip': '感知 {model}',
  'chat.mediaUnderstanding.title': '{category}感知：{model}（{status}）',
  'chat.mediaUnderstanding.unavailable': '未配置',
  'chat.mediaUnderstanding.unavailableShort': '无',
  'chat.mediaUnderstanding.model.auto': '自动 · {model}',
  'chat.mediaUnderstanding.menu.chip': '感知',
  'chat.mediaUnderstanding.menu.title': '感知模型',
  'chat.mediaUnderstanding.menu.titleWithSummary': '感知模型：{summary}',
  'chat.mediaUnderstanding.menu.categoryRow': '{category}：{model}',
  'chat.mediaUnderstanding.menu.categoryTitle': '{category}感知',
  'chat.mediaUnderstanding.menu.back': '返回',
  'chat.mediaUnderstanding.status.configured': '指定',
  'chat.mediaUnderstanding.status.auto': '自动',
  'chat.mediaUnderstanding.status.missing': '缺失',
  'chat.generation.param.ratio': '画面比例',
  'chat.generation.param.resolution': '分辨率',
  'chat.generation.param.videoDuration': '视频时长',
  'chat.generation.param.audioType': '音频类型',
  'chat.generation.param.audioDuration': '音频时长',
  'chat.generation.audioType.sfx': '音效',
  'chat.generation.audioType.ambient': '环境音',
  'chat.generation.audioType.voice': '人声',
  'chat.generation.paramHint.ratio.landscape': '横屏',
  'chat.generation.paramHint.ratio.portrait': '竖屏',
  'chat.generation.paramHint.ratio.square': '头像/封面',
  'chat.generation.paramHint.ratio.classic': '传统画幅',
  'chat.generation.paramHint.ratio.photo': '摄影构图',
  'chat.generation.paramHint.ratio.ultrawide': '宽银幕',
  'chat.generation.paramHint.ratio.cinema': '电影画幅',
  'chat.generation.paramHint.resolution.tiny': '快速预览',
  'chat.generation.paramHint.resolution.preview': '草图预览',
  'chat.generation.paramHint.resolution.hd': '常规高清',
  'chat.generation.paramHint.resolution.detail': '细节更多',
  'chat.generation.paramHint.resolution.final': '最终输出',
  'chat.generation.paramHint.duration.autoVideo': '根据镜头',
  'chat.generation.paramHint.duration.autoAudio': '根据内容',
  'chat.generation.paramHint.videoDuration.quick': '动作片段',
  'chat.generation.paramHint.videoDuration.short': '短镜头',
  'chat.generation.paramHint.videoDuration.normal': '常规镜头',
  'chat.generation.paramHint.videoDuration.beat': '完整节拍',
  'chat.generation.paramHint.videoDuration.scene': '小场景',
  'chat.generation.paramHint.videoDuration.long': '长镜头',
  'chat.generation.paramHint.videoDuration.sequence': '连续段落',
  'chat.generation.paramHint.audioType.sfx': '单个动作',
  'chat.generation.paramHint.audioType.ambient': '空间氛围',
  'chat.generation.paramHint.audioType.voice': '对白/旁白',
  'chat.generation.paramHint.audioDuration.instant': '瞬时点缀',
  'chat.generation.paramHint.audioDuration.short': '短促反馈',
  'chat.generation.paramHint.audioDuration.sfx': '常用音效',
  'chat.generation.paramHint.audioDuration.line': '一句台词',
  'chat.generation.paramHint.audioDuration.ambience': '氛围片段',
  'chat.generation.paramHint.audioDuration.moment': '完整动作',
  'chat.generation.paramHint.audioDuration.scene': '短场景',
  'chat.generation.paramHint.audioDuration.bed': '环境铺底',
  'chat.agentConfig.section.model': '主模型',
  'chat.agentConfig.category.chat': '对话',
  'chat.agentConfig.section.reasoning': '思考',
  'chat.agentConfig.section.verbosity': '详略',
  'chat.agentConfig.section.creativity': '创意',
  'chat.agentConfig.group.models': '模型配置',
  'chat.agentConfig.group.modelsShort': '模型',
  'chat.agentConfig.group.behavior': 'Agent 参数',
  'chat.agentConfig.group.behaviorShort': '参数',
  'chat.agentConfig.short.reasoning': '思考',
  'chat.agentConfig.short.verbosity': '详略',
  'chat.agentConfig.short.creativity': '创意',
  'chat.agentConfig.reasoning.fast': '快速',
  'chat.agentConfig.reasoning.balanced': '均衡',
  'chat.agentConfig.reasoning.deep': '深入',
  'chat.agentConfig.verbosity.brief': '简洁',
  'chat.agentConfig.verbosity.standard': '标准',
  'chat.agentConfig.verbosity.detailed': '详细',
  'chat.agentConfig.creativity.stable': '稳定',
  'chat.agentConfig.creativity.creative': '创意',
  'chat.agentConfig.creativity.wild': '发散',
  'chat.agentConfig.reasoning.fast.desc': '快速改写',
  'chat.agentConfig.reasoning.balanced.desc': '常规协作',
  'chat.agentConfig.reasoning.deep.desc': '复杂规划',
  'chat.agentConfig.verbosity.brief.desc': '短输出',
  'chat.agentConfig.verbosity.standard.desc': '适中细节',
  'chat.agentConfig.verbosity.detailed.desc': '完整展开',
  'chat.agentConfig.creativity.stable.desc': '保持一致',
  'chat.agentConfig.creativity.creative.desc': '默认创作',
  'chat.agentConfig.creativity.wild.desc': '大胆探索',
  'chat.executionMode.title': '执行模式',
  'chat.executionMode.plan': '计划',
  'chat.executionMode.planDesc': '模拟运行',
  'chat.executionMode.ask': '审批',
  'chat.executionMode.askDesc': '执行前确认',
  'chat.executionMode.auto': '自动',
  'chat.executionMode.autoDesc': '自动执行',
  'chat.commands.sections.agent': 'Agent',
  'chat.commands.sections.creation': '创作',
  'chat.commands.sections.skill': '技能',
  'chat.commands.source.project': '项目',
};

const chatModels: ChatModelOption[] = [
  {
    id: 'openai:gpt-5.5',
    label: 'OpenAI / gpt-5.5',
    providerLabel: 'OpenAI',
    source: 'explicit-config',
    connectionKind: 'direct',
    supportLevel: 'verified',
    providerId: 'openai',
    modelId: 'gpt-5.5',
    category: 'llm',
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode', 'streaming', 'code'],
    llmParameterControls: {
      reasoning: true,
      verbosity: true,
      creativity: true,
      maxOutputTokens: true,
    },
  },
  {
    id: 'google:gemini-flash',
    label: 'Google / Gemini Flash',
    providerLabel: 'Google',
    source: 'explicit-config',
    connectionKind: 'direct',
    supportLevel: 'verified',
    providerId: 'google',
    modelId: 'gemini-flash',
    category: 'llm',
    capabilities: ['chat', 'vision', 'vision_video'],
  },
  {
    id: 'google:gemini-pro',
    label: 'Google / Gemini Pro',
    providerLabel: 'Google',
    source: 'explicit-config',
    connectionKind: 'direct',
    supportLevel: 'verified',
    providerId: 'google',
    modelId: 'gemini-pro',
    category: 'llm',
    capabilities: ['chat', 'vision_video'],
  },
  {
    id: 'google:gemini-audio',
    label: 'Google / Gemini Audio',
    providerLabel: 'Google',
    source: 'explicit-config',
    connectionKind: 'direct',
    supportLevel: 'verified',
    providerId: 'google',
    modelId: 'gemini-audio',
    category: 'llm',
    capabilities: ['chat', 'audio'],
  },
];

const mediaModels: ChatModelOption[] = [
  {
    id: 'image-provider:model-image',
    label: 'Image Provider / Model Image',
    providerLabel: 'Image Provider',
    source: 'explicit-config',
    connectionKind: 'gateway',
    supportLevel: 'verified',
    providerId: 'image-provider',
    modelId: 'model-image',
    category: 'image',
    capabilities: ['text_to_image'],
  },
];

const allMediaModels: ChatModelOption[] = [
  ...mediaModels,
  {
    id: 'video-provider:model-video',
    label: 'Video Provider / Model Video',
    providerLabel: 'Video Provider',
    source: 'explicit-config',
    connectionKind: 'gateway',
    supportLevel: 'verified',
    providerId: 'video-provider',
    modelId: 'model-video',
    category: 'video',
    capabilities: ['text_to_video'],
  },
  {
    id: 'audio-provider:model-audio',
    label: 'Audio Provider / Model Audio',
    providerLabel: 'Audio Provider',
    source: 'explicit-config',
    connectionKind: 'gateway',
    supportLevel: 'verified',
    providerId: 'audio-provider',
    modelId: 'model-audio',
    category: 'audio',
    capabilities: ['text_to_audio'],
  },
];

const mediaUnderstandingModels: MediaUnderstandingModels = {
  image: {
    category: 'image',
    purpose: 'image.understand',
    status: 'auto',
    providerId: 'google',
    modelId: 'gemini-flash',
    optionId: 'google:gemini-flash',
    label: 'Google / Gemini Flash',
    providerLabel: 'Google',
    source: 'explicit-config',
  },
  audio: {
    category: 'audio',
    purpose: 'audio.understand',
    status: 'missing',
  },
  video: {
    category: 'video',
    purpose: 'video.understand',
    status: 'configured',
    providerId: 'google',
    modelId: 'gemini-flash',
    optionId: 'google:gemini-flash',
    label: 'Google / Gemini Flash',
    providerLabel: 'Google',
    source: 'explicit-config',
  },
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    locale: 'zh-cn',
    t: (key: string, params?: Record<string, unknown>) =>
      formatTranslation(translations[key] ?? key, params),
  }),
}));

describe('InputArea composer controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not feed unchanged mention menu state back into a controlled render store', () => {
    const onComposerStateCommit = vi.fn();

    function ControlledComposerHarness() {
      const [composerMenuState, setComposerMenuState] = useState(DEFAULT_COMPOSER_MENU_STATE);

      return (
        <Harness onRequestFiles={() => undefined}>
          <InputArea
            inputValue=""
            isThinking={false}
            composerMenuState={composerMenuState}
            onComposerMenuStateChange={(nextState) => {
              onComposerStateCommit(nextState);
              setComposerMenuState(nextState);
            }}
            onInputChange={vi.fn()}
            onSend={vi.fn()}
          />
        </Harness>
      );
    }

    expect(() => render(<ControlledComposerHarness />)).not.toThrow();
    expect(onComposerStateCommit).not.toHaveBeenCalled();
  });

  it('merges controlled slash menu updates against the latest Tab-owned state', () => {
    const onComposerMenuStateChange = vi.fn();
    render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={false}
          composerMenuState={DEFAULT_COMPOSER_MENU_STATE}
          onComposerMenuStateChange={onComposerMenuStateChange}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '/sto' } });

    expect(onComposerMenuStateChange).toHaveBeenLastCalledWith({
      ...DEFAULT_COMPOSER_MENU_STATE,
      slash: { open: true, filter: 'sto', selectedIndex: 0 },
    });
  });

  it('routes descendant control menus into the controlled Tab-owned menu state', () => {
    const onComposerMenuStateChange = vi.fn();
    render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={false}
          composerMenuState={DEFAULT_COMPOSER_MENU_STATE}
          onComposerMenuStateChange={onComposerMenuStateChange}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByTitle('执行模式 (Shift+Tab)'));

    expect(onComposerMenuStateChange).toHaveBeenLastCalledWith({
      ...DEFAULT_COMPOSER_MENU_STATE,
      controls: {
        ...DEFAULT_COMPOSER_MENU_STATE.controls,
        openMenu: 'execution-mode',
      },
    });
  });

  it('reports IME composition and blocks send while the Tab is composing', () => {
    const onCompositionChange = vi.fn();
    const onSend = vi.fn();
    const { rerender } = render(
      <Harness>
        <InputArea
          inputValue="正在输入"
          isThinking={false}
          isComposing
          onCompositionChange={onCompositionChange}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );
    const input = screen.getByRole('textbox');

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.compositionEnd(input);

    expect(onCompositionChange).toHaveBeenNthCalledWith(1, true);
    expect(onCompositionChange).toHaveBeenNthCalledWith(2, false);
    expect(onSend).not.toHaveBeenCalled();

    rerender(
      <Harness>
        <InputArea
          inputValue="正在输入"
          isThinking={false}
          isComposing={false}
          onCompositionChange={onCompositionChange}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('focuses only when the owning Tab focus request changes', () => {
    const { rerender } = render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={false}
          focusRequestOwner="tab-a"
          focusRequestTarget="none"
          focusRequestRevision={0}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );
    const input = screen.getByRole('textbox');
    expect(document.activeElement).not.toBe(input);

    rerender(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={false}
          focusRequestOwner="tab-a"
          focusRequestEnabled={false}
          focusRequestTarget="input"
          focusRequestRevision={1}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );
    expect(document.activeElement).not.toBe(input);

    rerender(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={false}
          focusRequestOwner="tab-a"
          focusRequestEnabled
          focusRequestTarget="input"
          focusRequestRevision={1}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );
    expect(document.activeElement).toBe(input);

    input.blur();
    rerender(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={false}
          focusRequestOwner="tab-b"
          focusRequestTarget="input"
          focusRequestRevision={1}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );
    expect(document.activeElement).toBe(input);
  });

  it('does not show creation staged creation controls just because the control callback exists', () => {
    const legacyControlProps: Record<string, unknown> = { onControlIdcWorkflow: vi.fn() };
    render(
      <Harness>
        <InputArea
          {...legacyControlProps}
          inputValue=""
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    expect(screen.queryByLabelText('阶段创作控制')).toBeNull();
  });

  it('keeps unconfigured conversations on Agent with an empty LLM selector only', () => {
    render(
      <Harness selectedModel="" availableModels={[]} availableMediaModels={[]}>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    const modeGroup = screen.getByRole('group', { name: '模式与模型' });
    expect(within(modeGroup).getByRole('button', { name: 'Agent' })).toBeTruthy();
    const paramsGroup = screen.getByRole('group', { name: '工具参数' });
    expect(within(paramsGroup).getByRole('button', { name: '对话' })).toBeTruthy();
    expect(within(paramsGroup).getByRole('group', { name: '模型配置' })).toBeTruthy();
    expect(within(paramsGroup).queryByRole('group', { name: 'Agent 参数' })).toBeNull();
    expect(within(paramsGroup).queryByRole('button', { name: '思考' })).toBeNull();
    expect(within(paramsGroup).queryByRole('button', { name: '详略' })).toBeNull();
    expect(within(paramsGroup).queryByRole('button', { name: '创意' })).toBeNull();
    expect(within(paramsGroup).queryByText('模型')).toBeNull();
    expect(within(paramsGroup).queryByText('参数')).toBeNull();
    expect(within(paramsGroup).getByRole('button', { name: '选择模型' }).textContent).toContain(
      '无可用模型',
    );

    fireEvent.click(within(modeGroup).getByRole('button', { name: 'Agent' }));
    expect(screen.queryByRole('menuitem', { name: /图片生成/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /视频生成/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /声音生成/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '生音乐' })).toBeNull();

    fireEvent.click(within(paramsGroup).getByRole('button', { name: '选择模型' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '自动' })).toBeNull();
  });

  it('hides legacy LLM/generation labels while preserving mode and params controls', () => {
    render(
      <Harness>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByText('生成')).toBeNull();
    const modeGroup = screen.getByRole('group', { name: '模式与模型' });
    const paramsGroup = screen.getByRole('group', { name: '工具参数' });
    expect(modeGroup.className).toContain('agent-composer-control-group-mode');
    expect(paramsGroup.className).toContain('agent-composer-control-group-config');
    expect(within(modeGroup).getByRole('button', { name: 'Agent' })).toBeTruthy();
    const categoryTrigger = within(paramsGroup).getByRole('button', { name: '对话' });
    const modelTrigger = within(paramsGroup).getByRole('button', { name: '选择模型' });
    const thinkingTrigger = within(paramsGroup).getByRole('button', { name: '思考' });
    const verbosityTrigger = within(paramsGroup).getByRole('button', { name: '详略' });
    const effectTrigger = within(paramsGroup).getByRole('button', { name: '创意' });
    expect(categoryTrigger).toBeTruthy();
    expect(within(paramsGroup).getByRole('group', { name: '模型配置' })).toBeTruthy();
    expect(within(paramsGroup).getByRole('group', { name: 'Agent 参数' })).toBeTruthy();
    expect(modelTrigger).toBeTruthy();
    expect(thinkingTrigger.textContent).toBe('均衡');
    expect(verbosityTrigger.textContent).toBe('标准');
    expect(effectTrigger.textContent).toBe('创意');
    expect([
      categoryTrigger.style.color,
      modelTrigger.style.color,
      thinkingTrigger.style.color,
      verbosityTrigger.style.color,
      effectTrigger.style.color,
    ]).toEqual([
      'rgb(16, 163, 127)',
      'rgb(16, 163, 127)',
      'rgb(16, 163, 127)',
      'rgb(16, 163, 127)',
      'rgb(16, 163, 127)',
    ]);
    expect(within(paramsGroup).queryByText('模型')).toBeNull();
    expect(within(paramsGroup).queryByText('参数')).toBeNull();
    expect(within(paramsGroup).queryByText('思考 均衡')).toBeNull();
    expect(within(paramsGroup).queryByText('详略 标准')).toBeNull();
    expect(within(paramsGroup).queryByText('创意 创意')).toBeNull();
    expect(within(paramsGroup).queryByRole('button', { name: '审批' })).toBeNull();
    expect(screen.getByRole('button', { name: '审批' })).toBeTruthy();
    expect(within(paramsGroup).getByTitle(/gpt-5.5/)).toBeTruthy();
    expect(screen.getByTitle('添加附件').className).toContain('agent-composer-tool-button');
    expect(screen.getByTitle('命令').className).toContain('agent-composer-tool-button');
    expect(document.querySelector('.agent-composer-toolbar')).toBeTruthy();
    expect(document.querySelector('.agent-composer-textarea')).toBeTruthy();
  });

  it('sends Agent LLM presets and the primary model slot from the unified config', () => {
    const onSend = vi.fn();
    render(
      <Harness>
        <InputArea
          inputValue="完善主角弧光"
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: '思考' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '深入' }));
    fireEvent.click(screen.getByRole('button', { name: '详略' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '详细' }));
    fireEvent.click(screen.getByRole('button', { name: '创意' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '稳定' }));
    fireEvent.click(screen.getByTitle('发送'));

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '完善主角弧光',
        agentModels: {
          primary: {
            providerId: 'openai',
            modelId: 'gpt-5.5',
            category: 'llm',
          },
        },
        llmConfig: {
          reasoningPreset: 'deep',
          verbosityPreset: 'detailed',
          creativityPreset: 'stable',
        },
      }),
    );
  }, 30_000);

  it('hides unsupported LLM parameters and trims them from the send payload', () => {
    const onSend = vi.fn();
    const basicChatModels: ChatModelOption[] = [
      {
        id: 'ollama:llama3.2',
        label: 'Ollama / llama3.2',
        providerId: 'ollama',
        modelId: 'llama3.2',
        category: 'llm',
        llmParameterControls: {
          reasoning: false,
          verbosity: false,
          creativity: true,
          maxOutputTokens: true,
        },
      },
    ];

    render(
      <Harness selectedModel="ollama:llama3.2" availableModels={basicChatModels}>
        <InputArea
          inputValue="扩展场景气氛"
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );

    const paramsGroup = screen.getByRole('group', { name: '工具参数' });
    expect(within(paramsGroup).queryByRole('button', { name: '思考' })).toBeNull();
    expect(within(paramsGroup).queryByRole('button', { name: '详略' })).toBeNull();
    expect(within(paramsGroup).getByRole('button', { name: '创意' })).toBeTruthy();

    fireEvent.click(screen.getByTitle('发送'));

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        agentModels: {
          primary: {
            providerId: 'ollama',
            modelId: 'llama3.2',
            category: 'llm',
          },
        },
        llmConfig: {
          creativityPreset: 'creative',
        },
      }),
    );
  });

  it('omits Agent LLM config when the selected model has no parameter contract', () => {
    const onSend = vi.fn();

    render(
      <Harness selectedModel="missing:model" availableModels={[]}>
        <InputArea
          inputValue="继续完善企划"
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByTitle('发送'));

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '继续完善企划',
        sessionMode: 'agent',
      }),
    );
    expect(onSend.mock.calls[0]?.[0]).not.toHaveProperty('llmConfig');
  });

  it('builds the primary Agent model from the selected catalog entry', () => {
    const onSend = vi.fn();
    const catalogModels: ChatModelOption[] = [
      {
        id: 'catalog-model-key',
        label: 'GPT 5.5',
        providerId: 'nekoapi-chat',
        modelId: 'gpt-5.5',
        category: 'llm',
        llmParameterControls: {
          reasoning: true,
          verbosity: true,
          creativity: true,
          maxOutputTokens: true,
        },
      },
    ];

    render(
      <Harness selectedModel="catalog-model-key" availableModels={catalogModels}>
        <InputArea
          inputValue="继续完善企划"
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByTitle('发送'));

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        agentModels: {
          primary: {
            providerId: 'nekoapi-chat',
            modelId: 'gpt-5.5',
            category: 'llm',
          },
        },
      }),
    );
  });

  it('shows Agent parameter field names as menu headers with compact options', () => {
    render(
      <Harness>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    const paramsGroup = screen.getByRole('group', { name: '工具参数' });
    fireEvent.click(within(paramsGroup).getByRole('button', { name: '创意' }));

    expect(within(paramsGroup).getByRole('button', { name: '创意' }).textContent).toBe('创意');
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('创意', { selector: '.agent-dropdown-header' })).toBeTruthy();
    const stableOption = screen.getByRole('menuitem', { name: '稳定' });
    const creativeOption = screen.getByRole('menuitem', { name: '创意' });
    const wildOption = screen.getByRole('menuitem', { name: '发散' });
    expect(stableOption.className).toContain('agent-dropdown-item-inline-detail');
    expect(stableOption.className).not.toContain('agent-dropdown-item-stacked');
    expect(creativeOption).toBeTruthy();
    expect(wildOption).toBeTruthy();
    expect(screen.queryByText('保持一致')).toBeNull();
    expect(screen.queryByText('默认创作')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /创意 ·/ })).toBeNull();
  });

  it('does not show stale Agent config after switching to a media mode', () => {
    render(
      <Harness sessionMode="image" availableMediaModels={allMediaModels}>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByRole('group', { name: 'Agent 参数' })).toBeNull();
    expect(screen.queryByRole('button', { name: '思考' })).toBeNull();
    expect(screen.getByTitle('Image Provider / Model Image')).toBeTruthy();
    expect(screen.getByRole('button', { name: '画面比例' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '分辨率' })).toBeTruthy();
  });

  it('switches Agent model configuration categories without changing the session mode', () => {
    const onSessionModeChange = vi.fn();
    const onGenCategoryChange = vi.fn();
    render(
      <Harness
        availableMediaModels={allMediaModels}
        mediaUnderstandingModels={mediaUnderstandingModels}
        onSessionModeChange={onSessionModeChange}
        onGenCategoryChange={onGenCategoryChange}
      >
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    const modeGroup = screen.getByRole('group', { name: '模式与模型' });
    const paramsGroupBefore = screen.getByRole('group', { name: '工具参数' });
    expect(within(modeGroup).getByRole('button', { name: 'Agent' })).toBeTruthy();
    fireEvent.click(within(paramsGroupBefore).getByRole('button', { name: '对话' }));
    expect(screen.getByRole('menuitem', { name: '对话' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /图片/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /视频/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /音频/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: '视频' }));

    expect(onSessionModeChange).not.toHaveBeenCalled();
    expect(onGenCategoryChange).toHaveBeenCalledWith('video');
    const paramsGroup = screen.getByRole('group', { name: '工具参数' });
    expect(within(paramsGroup).queryByRole('group', { name: 'Agent 参数' })).toBeNull();
    expect(within(paramsGroup).queryByRole('button', { name: '思考' })).toBeNull();
    fireEvent.click(within(paramsGroup).getByTitle('选择视频模型'));
    expect(screen.getByText('Video Provider')).toBeTruthy();
    const providerTagList = document.querySelector('.agent-model-provider-tags');
    expect(providerTagList?.querySelectorAll('.agent-model-tag')).toHaveLength(2);
    expect(providerTagList?.textContent).toBe('自定义中转');
    expect(screen.getByRole('menuitem', { name: /Model Video/ })).toBeTruthy();
    const modelTagList = document.querySelector('.agent-model-option-tags');
    expect(modelTagList?.querySelectorAll('.agent-model-tag')).toHaveLength(2);
    expect(modelTagList?.textContent).toBe('视频文生视频');
    fireEvent.click(screen.getByRole('menuitem', { name: /Model Video/ }));
    expect(within(paramsGroup).queryByRole('button', { name: /感知模型/ })).toBeNull();
    expect(within(paramsGroup).getByRole('button', { name: '画面比例' })).toBeTruthy();
    expect(within(paramsGroup).getByRole('button', { name: '分辨率' })).toBeTruthy();
    const durationTrigger = within(paramsGroup).getByRole('button', { name: '视频时长' });
    expect(durationTrigger.textContent).toBe('AUTO');
    fireEvent.click(durationTrigger);
    expect(screen.getByRole('menuitem', { name: /AUTO · 根据镜头/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '5s' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '8s' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '12s' })).toBeTruthy();
    expect(screen.queryByText('动作片段')).toBeNull();
    expect(screen.queryByText('常规镜头')).toBeNull();
    expect(screen.queryByText('小场景')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /6s/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /20s/ })).toBeNull();
  });

  it('hides Agent model configuration categories that have no configured models', () => {
    render(
      <Harness availableMediaModels={mediaModels}>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    const paramsGroup = screen.getByRole('group', { name: '工具参数' });
    fireEvent.click(within(paramsGroup).getByRole('button', { name: '对话' }));
    expect(screen.getByRole('menuitem', { name: '图片' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: '视频' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: '音频' })).toBeNull();
  });

  it('configures the media model from direct generation modes', () => {
    const onMediaModelSelect = vi.fn();
    render(
      <Harness
        sessionMode="image"
        availableMediaModels={allMediaModels}
        onMediaModelSelect={onMediaModelSelect}
      >
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    const modelTrigger = screen.getByTitle('Image Provider / Model Image');
    expect(modelTrigger.querySelector('.rounded-full')).toBeNull();

    fireEvent.click(modelTrigger);
    const menu = screen.getByRole('menu');
    expect(menu.querySelector('.rounded-full')).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: '不使用' }));

    expect(onMediaModelSelect).toHaveBeenCalledWith('image', 'none');

    fireEvent.click(screen.getByRole('button', { name: '分辨率' }));
    expect(screen.getByText('分辨率').className).toContain('agent-dropdown-header');
    expect(screen.getByRole('menuitem', { name: '1080p' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: '4K' })).toBeTruthy();
    expect(screen.queryByText('常规高清')).toBeNull();
    expect(screen.queryByText('最终输出')).toBeNull();
    expect(screen.getByRole('menu').className).toContain('agent-dropdown-menu-param');
    expect(screen.getByRole('button', { name: '分辨率' }).textContent).toBe('1080p');
  });

  it('does not show media understanding model controls in direct generation modes', () => {
    const onMediaUnderstandingModelSelect = vi.fn();
    render(
      <Harness
        sessionMode="video"
        availableMediaModels={allMediaModels}
        mediaUnderstandingModels={mediaUnderstandingModels}
        onMediaUnderstandingModelSelect={onMediaUnderstandingModelSelect}
      >
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByRole('button', { name: /感知模型/ })).toBeNull();
    expect(onMediaUnderstandingModelSelect).not.toHaveBeenCalled();
  });

  it('filters image understanding models by LLM vision capability', () => {
    render(
      <Harness
        availableMediaModels={allMediaModels}
        mediaUnderstandingModels={mediaUnderstandingModels}
      >
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: /感知模型/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /图片：/ }));

    expect(screen.getAllByRole('menuitem', { name: /Gemini Flash/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('menuitem', { name: /Gemini Pro/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Gemini Audio/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Model Image/ })).toBeNull();
  });

  it('filters audio understanding models by LLM audio capability', () => {
    render(
      <Harness
        availableMediaModels={allMediaModels}
        mediaUnderstandingModels={{
          ...mediaUnderstandingModels,
          audio: {
            category: 'audio',
            purpose: 'audio.understand',
            status: 'auto',
            providerId: 'google',
            modelId: 'gemini-audio',
            optionId: 'google:gemini-audio',
            label: 'Google / Gemini Audio',
            providerLabel: 'Google',
            source: 'explicit-config',
          },
        }}
      >
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: /感知模型/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /音频：/ }));

    expect(screen.getAllByRole('menuitem', { name: /Gemini Audio/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('menuitem', { name: /Gemini Flash/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Model Audio/ })).toBeNull();
  });

  it('removes the empty top control row for roleplay conversations', () => {
    render(
      <Harness conversationKind="character-dialogue">
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByRole('group', { name: '模式与模型' })).toBeNull();
    expect(screen.queryByRole('group', { name: '工具参数' })).toBeNull();
    expect(document.querySelector('.agent-composer-control-row')).toBeNull();
    expect(document.querySelector('.agent-composer-textarea')).toBeTruthy();
  });

  it('removes the empty top control row for embody-character conversations', () => {
    render(
      <Harness conversationKind="embody-character">
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByRole('group', { name: '模式与模型' })).toBeNull();
    expect(screen.queryByRole('group', { name: '工具参数' })).toBeNull();
    expect(document.querySelector('.agent-composer-control-row')).toBeNull();
    expect(document.querySelector('.agent-composer-textarea')).toBeTruthy();
  });

  it('shows creative collaboration and media generation in the command-style mode popup', () => {
    render(
      <Harness availableMediaModels={allMediaModels}>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));

    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('agent-composer-popover');
    expect(menu.className).toContain('agent-composer-session-mode-menu');
    expect(screen.queryByText('Agent 直接协作')).toBeNull();
    expect(screen.queryByText('媒体生成')).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Agent/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /图片/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /视频/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /音频/ })).toBeTruthy();
    expect(screen.getByText('完善故事主题、角色设定、世界观和场景氛围。')).toBeTruthy();
    expect(screen.queryByText('脚本生成')).toBeNull();
    expect(screen.queryByText('生成剧本')).toBeNull();
    expect(screen.queryByText('生成分镜')).toBeNull();
    expect(screen.queryByText('镜头描述')).toBeNull();
    expect(menu.textContent).not.toMatch(/对白|旁白|分镜节奏|镜头语言|镜头片段/);
  });

  it('inserts an ordinary skill selected from the dollar menu without invoking it', () => {
    render(
      <Harness
        skills={[
          {
            id: 'quality-review',
            name: 'quality-review',
            description: 'Review changed files',
            tags: [],
            source: 'project',
            enabled: true,
            slashCommand: 'legacy-review',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="" onSend={vi.fn()} />
      </Harness>,
    );

    const textarea = screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/' } });

    expect(screen.queryByRole('menuitem', { name: /legacy-review/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /\$quality-review/ })).toBeNull();

    fireEvent.change(textarea, { target: { value: '$qual' } });
    expect(screen.getByRole('menuitem', { name: /\$quality-review/ })).toBeTruthy();
    expect(screen.getByText('Review changed files')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /\$quality-review/ }));

    expect(textarea.value).toBe('$quality-review ');
    expect(vscodeMocks.invokeSkill).not.toHaveBeenCalled();
  });

  it('suppresses slash and skill command affordances in media generation mode', () => {
    render(
      <Harness sessionMode="image" availableMediaModels={allMediaModels}>
        <InputAreaStatefulHarness initialInputValue="" onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByTitle('命令')).toBeNull();
    expect(screen.queryByTitle('技能')).toBeNull();

    const textarea = screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/' } });
    expect(screen.queryByRole('menuitem', { name: /\// })).toBeNull();

    fireEvent.change(textarea, { target: { value: '$' } });
    expect(screen.queryByRole('menuitem', { name: /\$/ })).toBeNull();
  });

  it('suppresses slash and skill command affordances in roleplay while keeping mentions', () => {
    render(
      <Harness
        conversationKind="character-dialogue"
        mentionItems={[
          {
            id: 'entity:character:char-xiaoju',
            kind: 'entity',
            label: '小橘',
            description: '主角',
            entityType: 'character',
            navigationData: {
              entityId: 'char-xiaoju',
              entityKind: 'character',
              source: 'neko-entity',
            },
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="" onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByTitle('命令')).toBeNull();
    expect(screen.queryByTitle('技能')).toBeNull();

    const textarea = screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/' } });
    expect(screen.queryByRole('menuitem', { name: /\// })).toBeNull();

    fireEvent.change(textarea, { target: { value: '@小' } });
    expect(screen.getByTitle('小橘 主角')).toBeTruthy();
  });

  it('replaces a selected Entity mention with its context reference', () => {
    const onAddContextChip = vi.fn();
    const contextPayload: AgentContextPayload = {
      type: 'entity',
      id: 'entity:character:xiaoju',
      label: '小橘',
      summary: 'Entity · character',
      data: { entityId: 'xiaoju', entityKind: 'character' },
    };
    render(
      <Harness
        onAddContextChip={onAddContextChip}
        mentionItems={[
          {
            id: contextPayload.id,
            kind: 'entity',
            label: contextPayload.label,
            entityType: 'character',
            contextPayload,
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="" onSend={vi.fn()} />
      </Harness>,
    );

    const textarea = screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@小橘' } });
    fireEvent.click(screen.getByRole('menuitem', { name: /小橘/ }));

    expect(onAddContextChip).toHaveBeenCalledWith(contextPayload);
    expect(textarea.value).toBe('');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the entry prompt above the composer for asset generation modes', () => {
    const onSessionModeChange = vi.fn();
    const onEntryPromptMenuChange = vi.fn();
    render(
      <Harness availableMediaModels={allMediaModels} onSessionModeChange={onSessionModeChange}>
        <InputArea
          inputValue=""
          isThinking={false}
          entryPromptMenu="generate-assets"
          onEntryPromptMenuChange={onEntryPromptMenuChange}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('agent-composer-popover');
    expect(menu.className).toContain('agent-composer-entry-prompt-menu');
    expect(
      screen.getByText('选择素材生成模式，然后在输入框描述要生成的画面、视频或声音。'),
    ).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /图片生成/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /视频生成/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /声音生成/ })).toBeTruthy();
    expect(screen.queryByText('生成剧本')).toBeNull();
    expect(screen.queryByText('生成分镜')).toBeNull();
    expect(screen.queryByText('镜头描述')).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: /视频生成/ }));

    expect(onSessionModeChange).toHaveBeenCalledWith('video');
    expect(onEntryPromptMenuChange).toHaveBeenCalledWith(null);
  });

  it('opens the entry prompt for playable unified character entities', () => {
    const onSend = vi.fn();
    const onEntryPromptMenuChange = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'entity:char-xiaoju',
            kind: 'entity',
            label: '小橘',
            description: '主角',
            entityType: 'character',
          },
          {
            id: 'asset:asset-xiaoju',
            kind: 'asset',
            label: '小橘参考图',
            description: '角色资产',
            entityType: 'character',
            navigationData: { assetId: 'asset-xiaoju' },
          },
          {
            id: 'entity:char-cn',
            kind: 'entity',
            label: '中文角色',
            description: '统一实体',
            entityType: '角色',
          },
          {
            id: 'scene-1',
            kind: 'scene',
            label: '天台',
            entityType: 'scene',
          },
        ]}
      >
        <InputArea
          inputValue=""
          isThinking={false}
          entryPromptMenu="roleplay"
          onEntryPromptMenuChange={onEntryPromptMenuChange}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );

    expect(screen.getByText('选择可用的统一实体，进入角色扮演对话。')).toBeTruthy();
    expect(getEntryPromptRowByPrimaryText('小橘')).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /小橘参考图/ })).toBeNull();
    expect(getEntryPromptRowByPrimaryText('中文角色')).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /天台/ })).toBeNull();

    fireEvent.click(getEntryPromptRowByPrimaryText('小橘'));

    expect(onSend).not.toHaveBeenCalled();
    expect(vscodeMocks.startCharacterDialogueFromSlash).toHaveBeenCalledWith(
      'entity:char-xiaoju --roleplay --skip-enrich',
    );
    expect(onEntryPromptMenuChange).toHaveBeenCalledWith(null);
  });

  it('uses prefilled entry text as the roleplay opening line', () => {
    const onSend = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'entity:char-xiaoju',
            kind: 'entity',
            label: '小橘',
            entityType: 'character',
          },
        ]}
      >
        <InputArea
          inputValue="你还记得昨晚的雨吗？"
          isThinking={false}
          entryPromptMenu="roleplay"
          onEntryPromptMenuChange={vi.fn()}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /小橘/ }));

    expect(onSend).not.toHaveBeenCalled();
    expect(vscodeMocks.startCharacterDialogueFromSlash).toHaveBeenCalledWith(
      'entity:char-xiaoju --roleplay --skip-enrich "你还记得昨晚的雨吗？"',
    );
  });

  it('confirms a projected character Candidate before starting roleplay', () => {
    const onSend = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'entity:entity-projection:semantic-xiaoju',
            kind: 'entity',
            label: '小橘',
            description: 'Entity Candidate · character',
            entityType: 'character',
            navigationData: {
              candidateId: 'candidate:auto:character:小橘',
              projectSearchItemId: 'entity-projection:semantic-xiaoju',
            },
          },
        ]}
      >
        <InputArea
          inputValue="你好，小橘"
          isThinking={false}
          entryPromptMenu="roleplay"
          onEntryPromptMenuChange={vi.fn()}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );

    expect(screen.getByText('确认并扮演')).toBeTruthy();
    fireEvent.click(getEntryPromptRowByPrimaryText('小橘'));

    expect(vscodeMocks.confirmRoleplayCandidate).toHaveBeenCalledWith({
      projectSearchItemId: 'entity-projection:semantic-xiaoju',
      initialUserMessage: '你好，小橘',
    });
    expect(vscodeMocks.startCharacterDialogueFromSlash).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('projects selected canvas nodes into a lightweight reference row and recommended actions', () => {
    const onInputChange = vi.fn();
    render(
      <Harness
        ambientNodes={[
          { nodeId: 'shot-1', type: 'shot', summary: '#1 wide shot' },
          { nodeId: 'shot-2', type: 'shot', summary: '#2 close-up' },
          { nodeId: 'scene-1', type: 'scene', summary: 'Scene 1: Gate' },
        ]}
      >
        <InputArea
          inputValue=""
          isThinking={false}
          onInputChange={onInputChange}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    expect(screen.getByLabelText('画布选中上下文')).toBeTruthy();
    expect(document.querySelector('.agent-canvas-reference-row')).toBeTruthy();
    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.className).toContain('agent-reference-token');
    expect(token?.getAttribute('data-reference-variant')).toBe('ambient');
    expect(token?.getAttribute('data-reference-kind')).toBe('canvas');
    expect(document.querySelector('.agent-composer-shell [data-agent-canvas-context]')).toBeNull();
    expect(screen.getByText('#1 wide shot')).toBeTruthy();
    expect(screen.getByText('+2 个')).toBeTruthy();
    expect(screen.getByText('2 个镜头')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '批量生成' }));
    expect(onInputChange).toHaveBeenCalledWith('为选中的画布镜头批量生成图片。');
  });

  it('renders attached context and files with the shared reference token presentation', () => {
    const onRemoveContextChip = vi.fn();
    const onAttachedFilesChange = vi.fn();
    const contextChip: AgentContextPayload = {
      id: 'scene-1',
      type: 'scene',
      label: 'Scene 1',
      summary: 'Gate scene',
      data: null,
    };
    const attachedFile: MessageAttachment = {
      id: 'file-1',
      name: 'brief.md',
      type: 'file',
      size: 2048,
    };

    render(
      <Harness contextChips={[contextChip]} onRemoveContextChip={onRemoveContextChip}>
        <InputArea
          inputValue=""
          isThinking={false}
          attachedFiles={[attachedFile]}
          onAttachedFilesChange={onAttachedFilesChange}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    const tokens = Array.from(document.querySelectorAll('[data-agent-reference-token="true"]'));
    expect(tokens).toHaveLength(2);
    expect(tokens.map((token) => token.getAttribute('data-reference-variant'))).toEqual([
      'attached',
      'attached',
    ]);
    expect(tokens.map((token) => token.getAttribute('data-reference-kind'))).toEqual([
      'entity',
      'file',
    ]);
    expect(screen.getByText('Scene 1')).toBeTruthy();
    expect(screen.getByText('brief.md')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Scene 1' }));
    expect(onRemoveContextChip).toHaveBeenCalledWith('scene-1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove brief.md' }));
    expect(onAttachedFilesChange).toHaveBeenCalledWith([]);
  });

  it('moves completed @file mentions into reference tokens and preserves @path on send', () => {
    const onSend = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'zip',
            kind: 'file',
            label: '【CG】游戏角色.zip',
            filePath: 'assets/【CG】游戏角色.zip',
            source: 'workspace',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="参考 " onSend={onSend} />
      </Harness>,
    );

    fireEvent.change(screen.getByPlaceholderText('输入任何问题...'), {
      target: { value: '参考 @assets/【CG】游戏角色.zip ' },
    });

    const token = screen.getByText('【CG】游戏角色.zip').closest('[data-agent-reference-token]');
    expect(token?.getAttribute('data-reference-kind')).toBe('file');
    expect(token?.getAttribute('data-reference-variant')).toBe('attached');
    expect(screen.getByText('assets')).toBeTruthy();
    expect((screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement).value).toBe(
      '参考 ',
    );

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '参考 @assets/【CG】游戏角色.zip',
        displayMessageText: '参考 ',
        fileReferences: [
          expect.objectContaining({
            label: '【CG】游戏角色.zip',
            path: 'assets/【CG】游戏角色.zip',
          }),
        ],
      }),
    );
  });

  it('moves completed path-backed asset mentions into reference tokens', () => {
    const onSend = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'asset-hero',
            kind: 'asset',
            label: 'Hero portrait',
            filePath: 'assets/hero.png',
            source: 'asset-library',
            mediaType: 'image',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="参考 " onSend={onSend} />
      </Harness>,
    );

    fireEvent.change(screen.getByPlaceholderText('输入任何问题...'), {
      target: { value: '参考 @assets/hero.png' },
    });

    const token = screen.getByText('Hero portrait').closest('[data-agent-reference-token]');
    expect(token?.getAttribute('data-reference-kind')).toBe('image');
    expect(token?.getAttribute('data-reference-variant')).toBe('attached');
    expect(screen.getByText('assets')).toBeTruthy();
    expect((screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement).value).toBe(
      '参考 ',
    );

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '参考 @assets/hero.png',
        displayMessageText: '参考 ',
        fileReferences: [
          expect.objectContaining({
            label: 'Hero portrait',
            path: 'assets/hero.png',
            mediaType: 'image',
            source: 'asset-library',
          }),
        ],
      }),
    );
  });

  it('opens mention search for a controlled prefilled asset-library query', () => {
    const onRequestFiles = vi.fn();
    render(
      <Harness
        onRequestFiles={onRequestFiles}
        mentionItems={[
          {
            id: 'asset-lamp-spirit',
            kind: 'asset',
            label: '灯神立绘',
            filePath: 'assets/characters/lamp-spirit.png',
            source: 'asset-library',
            mediaType: 'image',
            searchText: '灯神 神灯 aladdin genie',
          },
        ]}
      >
        <InputArea inputValue="@灯神" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(onRequestFiles).toHaveBeenCalledWith('灯神');
    expect(screen.getByRole('menuitem', { name: /灯神立绘/ })).toBeTruthy();
  });

  it('selects @ mention files with CJK and spaces as reference tokens and clears the trigger', () => {
    const onSend = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'file-face',
            kind: 'file',
            label: '按键 黑脸.exp3.json',
            filePath: 'assets/live2d/按键 黑脸.exp3.json',
            source: 'workspace',
            mediaType: 'document',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="参考 " onSend={onSend} />
      </Harness>,
    );

    const textarea = screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '参考 @' } });
    fireEvent.click(screen.getByRole('menuitem', { name: /按键 黑脸\.exp3\.json/i }));

    const token = screen.getByText('按键 黑脸.exp3.json').closest('[data-agent-reference-token]');
    expect(token?.getAttribute('data-reference-kind')).toBe('file');
    expect(textarea.value).toBe('参考 ');

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '参考 @"assets/live2d/按键 黑脸.exp3.json"',
        displayMessageText: '参考 ',
        fileReferences: [
          expect.objectContaining({
            label: '按键 黑脸.exp3.json',
            path: 'assets/live2d/按键 黑脸.exp3.json',
          }),
        ],
      }),
    );
  });

  it('quotes selected @file references with spaces when sending', () => {
    const onSend = vi.fn();
    render(
      <Harness
        selectedFileReferences={[
          {
            id: 'file-ref:assets/ref file.zip',
            label: 'ref file.zip',
            path: 'assets/ref file.zip',
          },
        ]}
      >
        <InputArea inputValue="参考" isThinking={false} onInputChange={vi.fn()} onSend={onSend} />
      </Harness>,
    );

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '参考 @"assets/ref file.zip"',
        displayMessageText: '参考',
      }),
    );
  });

  it('queues plain text while a response is running and keeps stop available', () => {
    const onSend = vi.fn();
    const onCancel = vi.fn();
    const onPromoteQueuedMessage = vi.fn();
    const onCancelQueuedMessage = vi.fn();
    const onEditQueuedMessage = vi.fn();

    render(
      <Harness>
        <InputArea
          inputValue="继续处理"
          isThinking={true}
          queuedMessageCount={2}
          queuedMessages={[
            {
              id: 'queued-1',
              conversationId: 'conv-1',
              content: '消息队列功能是否完善',
              createdAt: 1,
              source: 'composer',
            },
          ]}
          onInputChange={vi.fn()}
          onPromoteQueuedMessage={onPromoteQueuedMessage}
          onCancelQueuedMessage={onCancelQueuedMessage}
          onEditQueuedMessage={onEditQueuedMessage}
          onSend={onSend}
          onCancel={onCancel}
        />
      </Harness>,
    );

    const textarea = screen.getByPlaceholderText('正在回答... 2 条排队消息待处理');
    expect(textarea).toBeTruthy();
    expect(screen.getByTitle('取消 (Esc)').className).toContain('agent-composer-stop');
    expect(document.querySelector('.agent-composer-queue-count')).toBeNull();
    const queuePanel = document.querySelector('.agent-composer-queue-panel');
    expect(queuePanel?.className).toContain('agent-composer-pending-panel');
    expect(queuePanel?.textContent).toContain('消息队列（2 条待处理）');
    expect(queuePanel?.textContent).toContain('消息队列功能是否完善');
    expect(queuePanel?.querySelector('.agent-composer-queue-row')?.className).toContain(
      'agent-composer-popover-row',
    );
    expect(screen.getByTitle('加入队列').className).toContain('agent-composer-queue');

    fireEvent.click(screen.getByTitle('设为下一条发送'));
    expect(onPromoteQueuedMessage).toHaveBeenCalledWith('queued-1');
    fireEvent.click(screen.getByTitle('重新编辑排队消息'));
    expect(onEditQueuedMessage).toHaveBeenCalledWith('queued-1');
    fireEvent.click(screen.getByTitle('取消排队消息'));
    expect(onCancelQueuedMessage).toHaveBeenCalledWith('queued-1');

    fireEvent.click(screen.getByTitle('加入队列'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '继续处理',
      }),
    );

    fireEvent.click(screen.getByTitle('取消 (Esc)'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses the conversation run contract for queue and stop controls without thinking visuals', () => {
    const onSend = vi.fn();
    const onCancel = vi.fn();

    render(
      <Harness>
        <InputArea
          inputValue="继续处理 Timeline"
          isThinking={false}
          isRunActive={true}
          onInputChange={vi.fn()}
          onSend={onSend}
          onCancel={onCancel}
        />
      </Harness>,
    );

    expect(screen.getByTitle('加入队列').className).toContain('agent-composer-queue');
    expect(screen.getByTitle('取消 (Esc)').className).toContain('agent-composer-stop');

    fireEvent.click(screen.getByTitle('加入队列'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '继续处理 Timeline',
      }),
    );

    fireEvent.click(screen.getByTitle('取消 (Esc)'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows locally queued message text before the runtime pending count arrives', () => {
    render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={true}
          queuedMessages={[
            {
              id: 'queued-1',
              conversationId: 'conv-1',
              content: '要求后续变更',
              createdAt: 1,
              source: 'composer',
            },
          ]}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
          onCancel={vi.fn()}
        />
      </Harness>,
    );

    expect(screen.getByText('消息队列（1 条待处理）')).toBeTruthy();
    expect(screen.getByText('要求后续变更')).toBeTruthy();
  });

  it('keeps mention suggestions as a composer overlay instead of a persistent rail block', () => {
    render(
      <Harness
        mentionItems={[
          {
            id: 'file:assets/storyboard.nkc',
            kind: 'file',
            label: 'storyboard.nkc',
            description: 'assets/storyboard.nkc',
            filePath: 'assets/storyboard.nkc',
          },
        ]}
      >
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    const textarea = screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@story' } });

    const mentionMenu = screen.getByRole('menu');
    const composerShell = document.querySelector('.agent-composer-shell');
    const controlRow = document.querySelector('.agent-composer-control-row');
    expect(mentionMenu.className).toContain('agent-composer-popover');
    expect(mentionMenu.className).toContain('agent-composer-mention-menu');
    expect(composerShell?.contains(mentionMenu)).toBe(true);
    expect(controlRow?.contains(mentionMenu)).toBe(false);
    expect(document.querySelector('.agent-composer-queue-panel')).toBeNull();
  });

  it('keeps queued items above mode controls and the composer shell, then can expand multiple items', () => {
    render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={true}
          queuedMessages={[
            {
              id: 'queued-1',
              conversationId: 'conv-1',
              content: '第一条很长的排队消息内容',
              createdAt: 1,
              source: 'composer',
            },
            {
              id: 'queued-2',
              conversationId: 'conv-1',
              content: '第二条排队消息',
              createdAt: 2,
              source: 'composer',
            },
          ]}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
          onCancel={vi.fn()}
        />
      </Harness>,
    );

    const queuePanel = document.querySelector('.agent-composer-queue-panel');
    const controlRow = document.querySelector('.agent-composer-control-row');
    const composerShell = document.querySelector('.agent-composer-shell');
    const textarea = screen.getByRole('textbox');
    expect(queuePanel).toBeTruthy();
    expect(controlRow).toBeTruthy();
    expect(composerShell).toBeTruthy();
    expect(composerShell?.contains(queuePanel)).toBe(false);
    expect(
      (queuePanel as Node).compareDocumentPosition(controlRow as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      (queuePanel as Node).compareDocumentPosition(composerShell as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      textarea.compareDocumentPosition(queuePanel as Node) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(screen.getByText('第一条很长的排队消息内容')).toBeTruthy();
    expect(screen.queryByText('第二条排队消息')).toBeNull();
    expect(screen.getByText('还有 1 条')).toBeTruthy();

    fireEvent.click(screen.getByTitle('展开'));
    expect(screen.getByText('第二条排队消息')).toBeTruthy();
    expect(screen.getByTitle('收起')).toBeTruthy();
  });

  it('keeps long queued prompts in a stable truncation row', () => {
    const longPrompt = '请把这段很长很长的排队提示词保持在输入框上方的单行队列里不要撑开布局';

    render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={true}
          queuedMessages={[
            {
              id: 'queued-long',
              conversationId: 'conv-1',
              content: longPrompt,
              createdAt: 1,
              source: 'composer',
            },
          ]}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
          onCancel={vi.fn()}
        />
      </Harness>,
    );

    const text = screen.getByTitle(longPrompt);
    expect(text.className).toContain('agent-composer-queue-text');
  });

  it('keeps queued item actions keyboard focusable with accessible labels', () => {
    render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={true}
          queuedMessages={[
            {
              id: 'queued-1',
              conversationId: 'conv-1',
              content: '继续优化',
              createdAt: 1,
              source: 'composer',
            },
          ]}
          onInputChange={vi.fn()}
          onPromoteQueuedMessage={vi.fn()}
          onCancelQueuedMessage={vi.fn()}
          onEditQueuedMessage={vi.fn()}
          onSend={vi.fn()}
          onCancel={vi.fn()}
        />
      </Harness>,
    );

    const promoteButton = screen.getByRole('button', { name: '设为下一条发送' });
    promoteButton.focus();
    expect(document.activeElement).toBe(promoteButton);
  });

  it('hides the queue panel when there are no queued items or pending count', () => {
    render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={true}
          queuedMessageCount={0}
          queuedMessages={[]}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
          onCancel={vi.fn()}
        />
      </Harness>,
    );

    expect(document.querySelector('.agent-composer-queue-panel')).toBeNull();
  });

  it('shows optimistic queued text but waits for runtime ids before enabling item actions', () => {
    const onPromoteQueuedMessage = vi.fn();

    render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={true}
          queuedMessages={[
            {
              id: 'optimistic:queued-local',
              conversationId: 'conv-1',
              content: '等待运行时确认',
              createdAt: 1,
              source: 'composer',
            },
          ]}
          onInputChange={vi.fn()}
          onPromoteQueuedMessage={onPromoteQueuedMessage}
          onSend={vi.fn()}
          onCancel={vi.fn()}
        />
      </Harness>,
    );

    expect(screen.getByText('等待运行时确认')).toBeTruthy();
    const promoteButton = screen.getByTitle('设为下一条发送');
    expect(promoteButton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(promoteButton);
    expect(onPromoteQueuedMessage).not.toHaveBeenCalled();
  });

  it('does not queue rich context while a response is running', () => {
    const onSend = vi.fn();

    render(
      <Harness
        selectedFileReferences={[
          {
            id: 'file-ref:assets/ref.png',
            label: 'ref.png',
            path: 'assets/ref.png',
          },
        ]}
      >
        <InputArea
          inputValue="参考"
          isThinking={true}
          onInputChange={vi.fn()}
          onSend={onSend}
          onCancel={vi.fn()}
        />
      </Harness>,
    );

    expect(screen.queryByTitle('加入队列')).toBeNull();
    expect(screen.getByTitle('取消 (Esc)')).toBeTruthy();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('locks model configuration while background work is active without blocking send', () => {
    const onSend = vi.fn();

    render(
      <Harness isBusy={true}>
        <InputArea
          inputValue="继续对话"
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );

    const paramsGroup = screen.getByRole('group', { name: '工具参数' });
    expect(
      (within(paramsGroup).getByRole('button', { name: '对话' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((within(paramsGroup).getByTitle(/gpt-5.5/) as HTMLButtonElement).disabled).toBe(true);
    expect(
      (within(paramsGroup).getByRole('button', { name: '思考' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '继续对话',
      }),
    );
  });

  it('keeps incomplete workspace references in the textarea until a token can be created', () => {
    render(
      <Harness
        mentionItems={[
          {
            id: 'video',
            kind: 'file',
            label: '1080P.mp4',
            filePath: 'cases/1080P.mp4',
            source: 'workspace',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="" onSend={vi.fn()} />
      </Harness>,
    );

    fireEvent.change(screen.getByPlaceholderText('输入任何问题...'), {
      target: { value: '请分析 @cases/1080' },
    });

    expect((screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement).value).toBe(
      '请分析 @cases/1080',
    );
    expect(document.querySelector('[data-agent-reference-token="true"]')).toBeNull();
  });
});

function InputAreaStatefulHarness({
  initialInputValue,
  onSend,
}: {
  readonly initialInputValue: string;
  readonly onSend: React.ComponentProps<typeof InputArea>['onSend'];
}) {
  const [inputValue, setInputValue] = useState(initialInputValue);
  const [selectedFileReferences, setSelectedFileReferences] = useState<
    NonNullable<React.ComponentProps<typeof InputArea>['selectedFileReferences']>
  >([]);

  return (
    <InputArea
      inputValue={inputValue}
      isThinking={false}
      selectedFileReferences={selectedFileReferences}
      onSelectedFileReferencesChange={setSelectedFileReferences}
      onInputChange={setInputValue}
      onSend={onSend}
    />
  );
}

function Harness({
  ambientNodes,
  contextChips = [],
  conversationKind,
  onRemoveContextChip = vi.fn(),
  onAddContextChip,
  mentionItems = [],
  onRequestFiles = vi.fn(),
  onMediaModelSelect = vi.fn(),
  onMediaUnderstandingModelSelect = vi.fn(),
  onGenCategoryChange = vi.fn(),
  onGenParamsChange = vi.fn(),
  onSessionModeChange = vi.fn(),
  selectedModel = 'openai:gpt-5.5',
  sessionMode = 'agent',
  skills = [],
  availableModels = chatModels,
  availableMediaModels = mediaModels,
  mediaUnderstandingModels,
  selectedFileReferences = [],
  onSelectedFileReferencesChange = vi.fn(),
  isBusy = false,
  children,
}: {
  readonly ambientNodes?: Array<{ nodeId: string; type: string; summary: string }>;
  readonly contextChips?: AgentContextPayload[];
  readonly conversationKind?: ConversationKind;
  readonly onRemoveContextChip?: (id: string) => void;
  readonly onAddContextChip?: React.ComponentProps<typeof InputAreaProvider>['onAddContextChip'];
  readonly mentionItems?: React.ComponentProps<typeof InputAreaProvider>['mentionItems'];
  readonly onRequestFiles?: React.ComponentProps<typeof InputAreaProvider>['onRequestFiles'];
  readonly onMediaModelSelect?: React.ComponentProps<
    typeof InputAreaProvider
  >['onMediaModelSelect'];
  readonly onMediaUnderstandingModelSelect?: React.ComponentProps<
    typeof InputAreaProvider
  >['onMediaUnderstandingModelSelect'];
  readonly onGenCategoryChange?: React.ComponentProps<
    typeof InputAreaProvider
  >['onGenCategoryChange'];
  readonly onGenParamsChange?: React.ComponentProps<typeof InputAreaProvider>['onGenParamsChange'];
  readonly onSessionModeChange?: React.ComponentProps<
    typeof InputAreaProvider
  >['onSessionModeChange'];
  readonly selectedModel?: string;
  readonly sessionMode?: SessionMode;
  readonly skills?: React.ComponentProps<typeof InputAreaProvider>['skills'];
  readonly availableModels?: ChatModelOption[];
  readonly availableMediaModels?: ChatModelOption[];
  readonly mediaUnderstandingModels?: MediaUnderstandingModels;
  readonly selectedFileReferences?: React.ComponentProps<
    typeof InputArea
  >['selectedFileReferences'];
  readonly onSelectedFileReferencesChange?: React.ComponentProps<
    typeof InputArea
  >['onSelectedFileReferencesChange'];
  readonly isBusy?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <InputAreaProvider
      isBusy={isBusy}
      selectedModel={selectedModel}
      availableModels={availableModels}
      onModelSelect={vi.fn()}
      mediaModelSelection={{
        image: 'image-provider:model-image',
        video: 'none',
        audio: 'none',
      }}
      availableMediaModels={availableMediaModels}
      mediaUnderstandingModels={mediaUnderstandingModels}
      mediaUnderstandingSelection={{ image: 'auto', video: 'auto', audio: 'auto' }}
      onMediaModelSelect={onMediaModelSelect}
      onMediaUnderstandingModelSelect={onMediaUnderstandingModelSelect}
      sessionMode={sessionMode}
      conversationKind={conversationKind}
      onSessionModeChange={onSessionModeChange}
      executionMode="ask"
      onExecutionModeChange={vi.fn()}
      contextTokenCount={0}
      maxContextTokens={8192}
      isCompressing={false}
      mediaModelCallCount={0}
      skills={skills}
      onRequestFiles={onRequestFiles}
      mentionItems={mentionItems}
      onAddContextChip={onAddContextChip}
      contextChips={contextChips}
      onRemoveContextChip={onRemoveContextChip}
      ambientNodes={ambientNodes}
      genCategory="image"
      genParams={DEFAULT_GENERATION_PARAMS}
      onGenCategoryChange={onGenCategoryChange}
      onGenParamsChange={onGenParamsChange}
    >
      {injectInputReferenceProps(children, {
        selectedFileReferences,
        onSelectedFileReferencesChange,
      })}
    </InputAreaProvider>
  );
}

function injectInputReferenceProps(
  children: React.ReactNode,
  props: Pick<
    React.ComponentProps<typeof InputArea>,
    'selectedFileReferences' | 'onSelectedFileReferencesChange'
  >,
) {
  if (!isValidElement<React.ComponentProps<typeof InputArea>>(children)) {
    return children;
  }
  return cloneElement(children, props);
}

function getEntryPromptRowByPrimaryText(text: string): HTMLButtonElement {
  const label = screen.getByText(text, { selector: '.agent-composer-popover-primary' });
  const row = label.closest('button');
  if (!(row instanceof HTMLButtonElement)) {
    throw new Error(`Entry prompt row not found for ${text}`);
  }
  return row;
}

function formatTranslation(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
