import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { cloneElement, isValidElement, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentContextPayload,
  AgentConfigurationPolicyProjection,
  AgentInputCatalogEntry,
  ConversationKind,
  MediaUnderstandingModels,
  MessageAttachment,
  SessionMode,
} from '@neko/agent-contracts';
import type { ChatModelOption } from '@neko/ai-contracts';
import { InputAreaProvider } from '../InputAreaContext';
import {
  DEFAULT_COMPOSER_MENU_STATE,
  DEFAULT_GENERATION_PARAMS,
  type MentionItem,
  type SelectedFileReference,
} from './types';
import { InputArea } from './InputArea';
import {
  ComposerWorkspaceProvider,
  type AgentComposerWorkspacePresentation,
} from '../../ComposerWorkspaceContext';

const translations: Record<string, string> = {
  'chat.input.control.mode': '模式、模型与参数',
  'chat.input.control.params': '工具参数',
  'chat.input.placeholder': '输入任何问题...',
  'chat.input.entryPlaceholder': '描述你想要完成的内容...',
  'chat.input.thinkingPlaceholder': '正在回答... 请等待或取消后再发送',
  'chat.input.attach': '添加附件',
  'chat.input.attachUnavailableWhileRunning': '当前回复结束后可添加附件',
  'chat.input.attachFile': '添加附件',
  'chat.input.workspace.label': '工作目录',
  'chat.input.workspace.openProject': '打开项目',
  'chat.input.workspace.chooseDirectory': '从系统目录选择',
  'chat.input.workspace.clear': '清除项目选择',
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
  'chat.input.canvasContext.count.markdown': '{count} 个 Markdown',
  'chat.input.canvasContext.count.media': '{count} 个媒体',
  'chat.input.canvasContext.count.groups': '{count} 个分组',
  'chat.input.canvasContext.more': '+{count} 个',
  'chat.input.canvasContext.action.createJob': '创建 JobCard',
  'chat.input.canvasContext.action.understand': '询问 Agent',
  'chat.input.canvasContext.prompt.createJob':
    '为选中的画布节点创建 JobCard，并将这些节点作为显式输入引用。',
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
  'chat.modelMenu.trigger': '配置模型',
  'chat.modelMenu.title': '模型配置',
  'chat.configMenu.title': '创作配置',
  'chat.configMenu.category': '内容类型',
  'chat.configMenu.section': '配置类型',
  'chat.configMenu.section.model': '模型',
  'chat.configMenu.section.params': '参数',
  'chat.configMenu.params.empty': '当前模型没有可配置参数',
  'chat.modelMenu.primary': '主模型',
  'chat.modelMenu.understanding': '{category}感知模型',
  'chat.modelMenu.generation': '{category}生成模型',
  'chat.modelMenu.behavior': '模型参数',
  'chat.modelMenu.autoUnderstanding': '自动（{model}）',
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
  'chat.generation.params.title': '生成参数',
  'chat.generation.params.trigger': '配置参数',
  'chat.generation.params.summary': '生成参数：{summary}',
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

const executableInputCatalog: readonly AgentInputCatalogEntry[] = [
  {
    id: 'command:builtin:clear',
    name: 'clear',
    description: 'Clear the exact conversation',
    trigger: 'command',
    prefix: '/',
    phaseRequirement: 'any',
    bindingRequirement: 'any',
    source: { kind: 'builtin', sourceId: 'clear' },
    availability: { status: 'available' },
    executable: { kind: 'command', commandId: 'clear', handlerId: 'builtin:clear' },
  },
  {
    id: 'skill:personal:quality-review',
    name: 'quality-review',
    description: 'Review changed files',
    trigger: 'skill',
    prefix: '$',
    phaseRequirement: 'any',
    bindingRequirement: 'any',
    source: { kind: 'personal', ownerId: 'assistant:default', sourceId: 'quality-review' },
    availability: { status: 'available' },
    executable: {
      kind: 'skill',
      skillName: 'quality-review',
      activationId: 'skill:personal:quality-review',
    },
  },
];

const characterUnavailableConfigurationPolicy: AgentConfigurationPolicyProjection = {
  request: null,
  fields: {
    model: {
      effectiveValue: null,
      source: 'domain-policy',
      policy: { status: 'unavailable', owner: 'character-version', reason: 'Unavailable.' },
    },
    executionMode: {
      effectiveValue: null,
      source: 'domain-policy',
      policy: { status: 'unavailable', owner: 'character-version', reason: 'Unavailable.' },
    },
    temperature: {
      effectiveValue: null,
      source: 'domain-policy',
      policy: { status: 'unavailable', owner: 'character-version', reason: 'Unavailable.' },
    },
    maximumOutputTokens: {
      effectiveValue: null,
      source: 'domain-policy',
      policy: { status: 'unavailable', owner: 'character-version', reason: 'Unavailable.' },
    },
    thinkingBudget: {
      effectiveValue: null,
      source: 'domain-policy',
      policy: { status: 'unavailable', owner: 'character-version', reason: 'Unavailable.' },
    },
  },
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

vi.mock('../../../i18n/I18nContext', () => ({
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
      <Harness
        inputCatalog={executableInputCatalog}
        inputCatalogPhase="session"
        inputCatalogBindingKind="assistant"
      >
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

  it('resets the textarea height when a sent draft is cleared programmatically', () => {
    const props = {
      isThinking: false,
      onInputChange: vi.fn(),
      onSend: vi.fn(),
    };
    const { rerender } = render(
      <Harness>
        <InputArea {...props} inputValue="line one" />
      </Harness>,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 180 });
    fireEvent.change(textarea, { target: { value: 'line one\nline two\nline three' } });
    expect(textarea.style.height).toBe('120px');

    rerender(
      <Harness>
        <InputArea {...props} inputValue="" />
      </Harness>,
    );

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('auto');
  });

  it('focuses only when the owning Tab focus request changes', () => {
    const { rerender } = render(
      <Harness>
        <InputArea
          inputValue=""
          isThinking={false}
          focusRequestOwner="tab-a"
          focusRequestTarget="none"
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
          focusRequestId="focus-a"
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
          focusRequestId="focus-a"
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
          focusRequestId="focus-b"
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );
    expect(document.activeElement).toBe(input);
  });

  it('keeps unconfigured conversations on the locked Agent mode with an empty LLM selector only', () => {
    render(
      <Harness selectedModel="" availableModels={[]} availableMediaModels={[]}>
        <InputArea
          composerPresentation="compact"
          inputValue=""
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    const modeGroup = screen.getByRole('group', { name: '模式、模型与参数' });
    expect(within(modeGroup).queryByRole('button', { name: 'Agent' })).toBeNull();
    const modelTrigger = within(modeGroup).getByRole('button', {
      name: '配置模型',
    });
    expect(modelTrigger.textContent).toContain('无可用模型');
    expect(within(modeGroup).queryByRole('button', { name: '配置参数' })).toBeNull();

    fireEvent.click(modelTrigger);
    const dialog = screen.getByRole('dialog', { name: '创作配置' });
    expect(dialog).toBeTruthy();
    expect(within(dialog).queryByRole('tablist', { name: '配置类型' })).toBeNull();
    expect(within(dialog).getByRole('heading', { name: '主模型' })).toBeTruthy();
    expect(within(dialog).getByText('无可用模型')).toBeTruthy();
    expect(screen.queryByText('全选')).toBeNull();
  });

  it('renders the current Agent composer controls', () => {
    render(
      <Harness>
        <InputArea
          composerPresentation="compact"
          inputValue=""
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    const modeGroup = screen.getByRole('group', { name: '模式、模型与参数' });
    expect(modeGroup.className).toContain('agent-composer-mode-controls');
    expect(within(modeGroup).queryByRole('button', { name: 'Agent' })).toBeNull();
    const modelTrigger = within(modeGroup).getByRole('button', { name: '配置模型' });
    expect(modelTrigger).toBeTruthy();
    expect(modelTrigger.textContent).toBe('gpt-5.5');
    expect(screen.getByRole('button', { name: '审批' })).toBeTruthy();
    expect(within(modeGroup).getByTitle(/gpt-5.5/)).toBeTruthy();
    expect(screen.getByTitle('添加附件').className).toContain('agent-composer-tool-button');
    expect(screen.queryByTitle('命令')).toBeNull();
    expect(screen.queryByTitle('技能')).toBeNull();
    expect(document.querySelector('.agent-composer-toolbar')).toBeTruthy();
    expect(document.querySelector('.agent-composer-textarea')).toBeTruthy();
  });

  it('omits the locked Workspace label from the conversation composer', () => {
    render(
      <Harness composerWorkspace={{ kind: 'workspace', label: 'OpenNeko' }}>
        <InputArea
          composerPresentation="compact"
          inputValue=""
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    expect(screen.queryByLabelText('工作目录')).toBeNull();
    expect(screen.queryByText(/branch|分支|local|本地/iu)).toBeNull();
  });

  it('keeps command and Skill discovery available in the Entry composer', () => {
    render(
      <Harness
        inputCatalog={executableInputCatalog}
        inputCatalogPhase="draft"
        inputCatalogBindingKind="assistant"
      >
        <InputArea
          presentation="entry"
          inputValue=""
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    const modeGroup = screen.getByRole('group', { name: '模式、模型与参数' });
    expect(within(modeGroup).getByRole('button', { name: '配置模型' })).toBeTruthy();
    expect(within(modeGroup).queryByRole('button', { name: 'Agent' })).toBeNull();
    expect(screen.getByRole('button', { name: '审批' })).toBeTruthy();
    expect(screen.queryByTitle('命令')).toBeNull();
    expect(screen.queryByTitle('技能')).toBeNull();
    expect(screen.queryByTitle('chat.usage.clickToCompress')).toBeNull();
    expect(document.querySelector('.agent-composer-shell')).toBeTruthy();
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toBe('描述你想要完成的内容...');
  });

  it('keeps the Entry textarea editable while a prerequisite blocks only send', () => {
    render(
      <Harness>
        <InputArea
          presentation="entry"
          inputValue="keep editing"
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
          submissionBlockedReason="请选择项目或已授权目录。"
        />
      </Harness>,
    );

    expect(screen.getByRole('textbox')).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: '请选择项目或已授权目录。' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('status').textContent).toBe('请选择项目或已授权目录。');
  });

  it('keeps Entry Workspace target selection in the package-owned composer', async () => {
    const target = {
      label: 'OpenNeko',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
    };
    const onSelectProject = vi.fn().mockResolvedValue(target);
    const onTargetChange = vi.fn();
    render(
      <Harness
        composerWorkspace={{
          kind: 'entry',
          projects: [{ projectId: 'project-1', label: 'OpenNeko' }],
          onChooseDirectory: vi.fn().mockResolvedValue(undefined),
          onSelectProject,
        }}
      >
        <InputArea
          presentation="entry"
          inputValue=""
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
          onDraftWorkspaceTargetChange={onTargetChange}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: '打开项目' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'OpenNeko' }));

    await waitFor(() => expect(onTargetChange).toHaveBeenCalledWith(target));
    expect(onSelectProject).toHaveBeenCalledWith('project-1');
    expect(screen.queryByRole('button', { name: 'chat.emptyState.entry.startChat' })).toBeNull();
  });

  it('keeps unbound Entry @ discovery local and closes its empty menu with Escape', () => {
    const onRequestFiles = vi.fn();
    render(
      <Harness
        inputCatalog={executableInputCatalog}
        inputCatalogPhase="draft"
        inputCatalogBindingKind="unbound"
        onRequestFiles={onRequestFiles}
      >
        <InputAreaStatefulHarness initialInputValue="" onSend={vi.fn()} />
      </Harness>,
    );

    const textbox = screen.getByRole('textbox');
    fireEvent.change(textbox, { target: { value: '@story' } });

    expect(onRequestFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.keyDown(textbox, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('sends the primary Agent model without composer LLM parameters', () => {
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

    expect(screen.queryByRole('button', { name: '配置参数' })).toBeNull();
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
      }),
    );
    expect(onSend.mock.calls[0]?.[0]).not.toHaveProperty('llmConfig');
  }, 30_000);

  it('does not expose Agent parameters even when the model catalog declares controls', () => {
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

    expect(screen.queryByRole('button', { name: '配置参数' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: '思考' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: '详略' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: '创意' })).toBeNull();

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
      }),
    );
    expect(onSend.mock.calls[0]?.[0]).not.toHaveProperty('llmConfig');
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

  it('renders one model trigger without direct-generation mode controls', () => {
    render(
      <Harness>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(document.querySelector('.agent-composer-control-row')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Agent' })).toBeNull();
    expect(screen.queryByRole('button', { name: '图片' })).toBeNull();
    expect(screen.queryByRole('button', { name: '视频' })).toBeNull();
    expect(screen.queryByRole('button', { name: '音频' })).toBeNull();
    expect(screen.getByRole('button', { name: '配置模型' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '配置参数' })).toBeNull();
    expect(screen.queryByRole('button', { name: '对话' })).toBeNull();
    expect(screen.queryByRole('button', { name: /感知模型/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '创意' })).toBeNull();
  });

  it('selects exact chat, understanding, generation, auto, and none bindings from one menu', () => {
    const onSessionModeChange = vi.fn();
    const onModelSelect = vi.fn();
    const onMediaUnderstandingModelSelect = vi.fn();
    const onMediaModelSelect = vi.fn();
    render(
      <Harness
        availableMediaModels={allMediaModels}
        mediaUnderstandingModels={mediaUnderstandingModels}
        onSessionModeChange={onSessionModeChange}
        onModelSelect={onModelSelect}
        onMediaUnderstandingModelSelect={onMediaUnderstandingModelSelect}
        onMediaModelSelect={onMediaModelSelect}
      >
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: '配置模型' }));
    const configDialog = screen.getByRole('dialog', { name: '创作配置' });
    expect(
      within(screen.getByRole('tablist', { name: '内容类型' })).getAllByRole('tab'),
    ).toHaveLength(4);
    expect(within(configDialog).queryByRole('tablist', { name: '配置类型' })).toBeNull();
    expect(within(configDialog).getByRole('heading', { name: '主模型' })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: /Gemini Flash/ }));
    expect(onModelSelect).toHaveBeenCalledWith('google:gemini-flash');
    expect(onSessionModeChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: '图片' }));
    expect(
      within(screen.getByRole('tablist', { name: '配置类型' })).getAllByRole('tab'),
    ).toHaveLength(2);
    const understandingGroup = screen.getByRole('radiogroup', { name: '图片感知模型' });
    fireEvent.click(within(understandingGroup).getByRole('radio', { name: /^Gemini Flash/ }));
    expect(onMediaUnderstandingModelSelect).toHaveBeenCalledWith('image', 'google:gemini-flash');
    fireEvent.click(within(understandingGroup).getByRole('radio', { name: /自动/ }));
    expect(onMediaUnderstandingModelSelect).toHaveBeenCalledWith('image', 'auto');

    const generationGroup = screen.getByRole('radiogroup', { name: '图片生成模型' });
    fireEvent.click(within(generationGroup).getByRole('radio', { name: /Model Image/ }));
    expect(onMediaModelSelect).toHaveBeenCalledWith('image', 'image-provider:model-image');
    fireEvent.click(within(generationGroup).getByRole('radio', { name: '不使用' }));
    expect(onMediaModelSelect).toHaveBeenCalledWith('image', 'none');
    expect(screen.queryByText('全选')).toBeNull();
  });

  it('keeps all purpose categories visible and exposes empty exact-selection groups', () => {
    render(
      <Harness availableMediaModels={mediaModels}>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('button', { name: '配置模型' }));
    expect(screen.getByRole('tab', { name: '图片' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '视频' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '音频' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: '视频' }));
    const generationGroup = screen.getByRole('radiogroup', { name: '视频生成模型' });
    expect(within(generationGroup).getAllByRole('radio')).toHaveLength(1);
    expect(within(generationGroup).getByRole('radio', { name: '不使用' })).toBeTruthy();
  });

  it('locks the shared model menu while an Agent run is busy', () => {
    render(
      <Harness isBusy={true}>
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    const trigger = screen.getByRole('button', { name: '配置模型' });
    expect(trigger).toHaveProperty('disabled', true);
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog', { name: '创作配置' })).toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: '配置模型' }));
    fireEvent.click(screen.getByRole('tab', { name: '图片' }));
    const understandingGroup = screen.getByRole('radiogroup', { name: '图片感知模型' });

    expect(within(understandingGroup).getByRole('radio', { name: /^Gemini Flash/ })).toBeTruthy();
    expect(within(understandingGroup).queryByRole('radio', { name: /Gemini Pro/ })).toBeNull();
    expect(within(understandingGroup).queryByRole('radio', { name: /Gemini Audio/ })).toBeNull();
    expect(within(understandingGroup).queryByRole('radio', { name: /Model Image/ })).toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: '配置模型' }));
    fireEvent.click(screen.getByRole('tab', { name: '音频' }));
    const understandingGroup = screen.getByRole('radiogroup', { name: '音频感知模型' });

    expect(within(understandingGroup).getByRole('radio', { name: /^Gemini Audio/ })).toBeTruthy();
    expect(within(understandingGroup).queryByRole('radio', { name: /Gemini Flash/ })).toBeNull();
    expect(within(understandingGroup).queryByRole('radio', { name: /Model Audio/ })).toBeNull();
  });

  it('removes the empty top control row for roleplay conversations', () => {
    render(
      <Harness
        conversationKind="character-dialogue"
        configurationPolicy={characterUnavailableConfigurationPolicy}
      >
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByRole('group', { name: '模式、模型与参数' })).toBeNull();
    expect(screen.queryByRole('group', { name: '工具参数' })).toBeNull();
    expect(document.querySelector('.agent-composer-control-row')).toBeNull();
    expect(document.querySelector('.agent-composer-textarea')).toBeTruthy();
  });

  it('removes the empty top control row for embody-character conversations', () => {
    render(
      <Harness
        conversationKind="embody-character"
        configurationPolicy={characterUnavailableConfigurationPolicy}
      >
        <InputArea inputValue="" isThinking={false} onInputChange={vi.fn()} onSend={vi.fn()} />
      </Harness>,
    );

    expect(screen.queryByRole('group', { name: '模式、模型与参数' })).toBeNull();
    expect(screen.queryByRole('group', { name: '工具参数' })).toBeNull();
    expect(document.querySelector('.agent-composer-control-row')).toBeNull();
    expect(document.querySelector('.agent-composer-textarea')).toBeTruthy();
  });

  it('inserts an ordinary skill selected from the dollar menu without invoking it', () => {
    render(
      <Harness
        inputCatalog={[
          {
            id: 'skill:project:quality-review',
            name: 'quality-review',
            description: 'Review changed files',
            trigger: 'skill',
            prefix: '$',
            phaseRequirement: 'any',
            bindingRequirement: 'workspace',
            source: { kind: 'project', workspaceId: 'workspace-1', sourceId: 'skill-source-1' },
            availability: { status: 'available' },
            executable: {
              kind: 'skill',
              skillName: 'quality-review',
              activationId: 'skill:project:skill:skill-source-1',
            },
          },
        ]}
        inputCatalogPhase="session"
        inputCatalogBindingKind="workspace"
      >
        <InputAreaStatefulHarness initialInputValue="" onSend={vi.fn()} />
      </Harness>,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '/' } });

    expect(screen.queryByRole('menuitem', { name: /\$quality-review/ })).toBeNull();

    fireEvent.change(textarea, { target: { value: '$qual' } });
    expect(screen.getByRole('menuitem', { name: /\$quality-review/ })).toBeTruthy();
    expect(screen.getByText('Review changed files')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /\$quality-review/ }));

    expect(textarea.value).toBe('$quality-review ');
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

  it('selects a receipt-backed Workspace file as a Draft context reference', () => {
    const onAddContextChip = vi.fn();
    const contextPayload: AgentContextPayload = {
      type: 'file',
      id: 'workspace-reference:hero',
      label: 'hero.md',
      summary: 'notes/hero.md',
      data: {
        contentLocator: { kind: 'workspace-file', path: 'notes/hero.md' },
        catalogEntryId: 'mention:workspace-reference:hero',
        referenceId: 'workspace-reference:hero',
        ownerKind: 'workspace',
        ownerId: 'workspace-1',
        bindingReceiptId: 'binding-1',
      },
    };
    render(
      <Harness
        onAddContextChip={onAddContextChip}
        mentionItems={[
          {
            id: 'file:hero',
            kind: 'file',
            label: 'hero.md',
            contentLocator: { kind: 'workspace-file', path: 'notes/hero.md' },
            contextPayload,
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="" onSend={vi.fn()} presentation="entry" />
      </Harness>,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '@hero' } });
    fireEvent.click(screen.getByRole('menuitem', { name: /hero\.md/ }));

    expect(onAddContextChip).toHaveBeenCalledWith(contextPayload);
    expect(document.querySelector('[data-agent-reference-token="true"]')).toBeNull();
    expect(textarea.value).toBe('');
  });

  it('opens the entry prompt only for exact published Character selections', () => {
    const onSend = vi.fn();
    const onEntryPromptMenuChange = vi.fn();
    const onDraftCharacterTargetSelect = vi.fn(async () => undefined);
    render(
      <Harness
        mentionItems={[
          {
            id: 'entity:char-xiaoju',
            kind: 'entity',
            label: '小橘',
            description: '主角',
            entityType: 'character',
            navigationData: {
              characterId: 'char-xiaoju',
              characterVersionId: 'character-version-xiaoju',
              roleProfileId: 'role-profile-xiaoju',
            },
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
            navigationData: {
              characterId: 'char-cn',
              characterVersionId: 'character-version-cn',
              roleProfileId: 'role-profile-cn',
            },
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
          onDraftCharacterTargetSelect={onDraftCharacterTargetSelect}
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
    expect(onDraftCharacterTargetSelect).toHaveBeenCalledWith({
      kind: 'character',
      characterId: 'char-xiaoju',
      characterVersionId: 'character-version-xiaoju',
      roleProfileId: 'role-profile-xiaoju',
    });
    expect(onEntryPromptMenuChange).toHaveBeenCalledWith(null);
  });

  it('preserves prefilled Draft text while binding the exact Character target', () => {
    const onSend = vi.fn();
    const onDraftCharacterTargetSelect = vi.fn(async () => undefined);
    render(
      <Harness
        mentionItems={[
          {
            id: 'entity:char-xiaoju',
            kind: 'entity',
            label: '小橘',
            entityType: 'character',
            navigationData: {
              characterId: 'char-xiaoju',
              characterVersionId: 'character-version-xiaoju',
              roleProfileId: 'role-profile-xiaoju',
            },
          },
        ]}
      >
        <InputArea
          inputValue="你还记得昨晚的雨吗？"
          isThinking={false}
          entryPromptMenu="roleplay"
          onEntryPromptMenuChange={vi.fn()}
          onDraftCharacterTargetSelect={onDraftCharacterTargetSelect}
          onInputChange={vi.fn()}
          onSend={onSend}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /小橘/ }));

    expect(onSend).not.toHaveBeenCalled();
    expect(onDraftCharacterTargetSelect).toHaveBeenCalledWith(
      expect.objectContaining({ characterVersionId: 'character-version-xiaoju' }),
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('你还记得昨晚的雨吗？');
  });

  it('keeps an Entity candidate unavailable until Chara publishes exact identities', () => {
    const onSend = vi.fn();
    const onDraftCharacterTargetSelect = vi.fn(async () => undefined);
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
          onDraftCharacterTargetSelect={onDraftCharacterTargetSelect}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
        />
      </Harness>,
    );

    expect(screen.getByText('未找到可用于角色扮演的角色实体。')).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /小橘/ })).toBeNull();
    expect(onDraftCharacterTargetSelect).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('projects canonical canvas nodes into a lightweight reference row and JobCard action', () => {
    const onInputChange = vi.fn();
    render(
      <Harness
        ambientNodes={[
          { nodeId: 'markdown-1', type: 'markdown', summary: 'Creative brief' },
          { nodeId: 'media-1', type: 'media', summary: 'image: keyframe.png' },
          { nodeId: 'group-1', type: 'group', summary: 'Act one (2)' },
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
    expect(screen.getByText('Creative brief')).toBeTruthy();
    expect(screen.getByText('+2 个')).toBeTruthy();
    expect(screen.getByText('1 个 Markdown')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '创建 JobCard' }));
    expect(onInputChange).toHaveBeenCalledWith(
      '为选中的画布节点创建 JobCard，并将这些节点作为显式输入引用。',
    );
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

  it('uses Host authorization for draft attachments and adds only the opaque context payload', async () => {
    const payload: AgentContextPayload = {
      type: 'file',
      id: 'grant-1',
      label: 'notes.txt',
      summary: 'Authorized file: notes.txt',
      data: { resourceGrantId: 'grant-1', resourceKind: 'file' },
    };
    const onAuthorizeResource = vi.fn(async () => payload);
    const onAddContextChip = vi.fn();
    render(
      <Harness onAddContextChip={onAddContextChip}>
        <InputArea
          inputValue=""
          isThinking={false}
          onInputChange={vi.fn()}
          onSend={vi.fn()}
          onAuthorizeResource={onAuthorizeResource}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByTitle('添加附件'));
    await vi.waitFor(() => expect(onAddContextChip).toHaveBeenCalledWith(payload));
    expect(onAuthorizeResource).toHaveBeenCalledOnce();
    expect(JSON.stringify(onAddContextChip.mock.calls)).not.toContain('/Users');
  });

  it('moves completed @file mentions into reference tokens without rewriting the message', () => {
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
        messageText: '参考 ',
        displayMessageText: '参考 ',
        fileReferences: [
          expect.objectContaining({
            label: '【CG】游戏角色.zip',
            contentLocator: {
              kind: 'workspace-file',
              path: 'assets/【CG】游戏角色.zip',
            },
          }),
        ],
      }),
    );
  });

  it('moves completed Media Library mentions into reference tokens', () => {
    const onSend = vi.fn();
    render(
      <Harness
        mentionItems={[
          {
            id: 'media-hero',
            kind: 'media',
            label: 'Hero portrait',
            filePath: 'neko/assets/Characters/hero.png',
            source: 'media-library',
            mediaType: 'image',
          },
        ]}
      >
        <InputAreaStatefulHarness initialInputValue="参考 " onSend={onSend} />
      </Harness>,
    );

    fireEvent.change(screen.getByPlaceholderText('输入任何问题...'), {
      target: { value: '参考 @neko/assets/Characters/hero.png' },
    });

    const token = screen.getByText('Hero portrait').closest('[data-agent-reference-token]');
    expect(token?.getAttribute('data-reference-kind')).toBe('image');
    expect(token?.getAttribute('data-reference-variant')).toBe('attached');
    expect((screen.getByPlaceholderText('输入任何问题...') as HTMLTextAreaElement).value).toBe(
      '参考 ',
    );

    fireEvent.click(screen.getByTitle('发送'));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: '参考 ',
        displayMessageText: '参考 ',
        fileReferences: [
          expect.objectContaining({
            label: 'Hero portrait',
            contentLocator: {
              kind: 'workspace-file',
              path: 'neko/assets/Characters/hero.png',
            },
            mediaType: 'image',
            source: 'media-library',
          }),
        ],
      }),
    );
  });

  it('opens mention search for a controlled prefilled Media Library query', () => {
    const onRequestFiles = vi.fn();
    render(
      <Harness
        onRequestFiles={onRequestFiles}
        inputCatalogPhase="draft"
        inputCatalogBindingKind="workspace"
        mentionItems={[
          {
            id: 'media-lamp-spirit',
            kind: 'media',
            label: '灯神立绘',
            filePath: 'neko/assets/Characters/lamp-spirit.png',
            source: 'media-library',
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
        messageText: '参考 ',
        displayMessageText: '参考 ',
        fileReferences: [
          expect.objectContaining({
            label: '按键 黑脸.exp3.json',
            contentLocator: {
              kind: 'workspace-file',
              path: 'assets/live2d/按键 黑脸.exp3.json',
            },
          }),
        ],
      }),
    );
  });

  it('sends selected @file references separately from unchanged message text', () => {
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
        messageText: '参考',
        displayMessageText: '参考',
        fileReferences: [
          expect.objectContaining({
            contentLocator: { kind: 'workspace-file', path: 'assets/ref file.zip' },
          }),
        ],
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
    expect((textarea as HTMLTextAreaElement).disabled).toBe(false);
    (textarea as HTMLTextAreaElement).focus();
    expect(document.activeElement).toBe(textarea);
    expect((screen.getByTitle('当前回复结束后可添加附件') as HTMLButtonElement).disabled).toBe(
      true,
    );
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
    expect(controlRow).toBeNull();
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
    const composerShell = document.querySelector('.agent-composer-shell');
    const textarea = screen.getByRole('textbox');
    expect(queuePanel).toBeTruthy();
    expect(composerShell).toBeTruthy();
    expect(composerShell?.contains(queuePanel)).toBe(false);
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

    const modeGroup = screen.getByRole('group', { name: '模式、模型与参数' });
    expect(within(modeGroup).queryByRole('button', { name: 'Agent' })).toBeNull();
    expect(
      (
        within(modeGroup).getByRole('button', {
          name: '配置模型',
        }) as HTMLButtonElement
      ).disabled,
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
  presentation,
}: {
  readonly initialInputValue: string;
  readonly onSend: React.ComponentProps<typeof InputArea>['onSend'];
  readonly presentation?: React.ComponentProps<typeof InputArea>['presentation'];
}) {
  const [inputValue, setInputValue] = useState(initialInputValue);
  const [selectedFileReferences, setSelectedFileReferences] = useState<
    NonNullable<React.ComponentProps<typeof InputArea>['selectedFileReferences']>
  >([]);

  return (
    <InputArea
      presentation={presentation}
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
  onModelSelect = vi.fn(),
  onMediaModelSelect = vi.fn(),
  onMediaUnderstandingModelSelect = vi.fn(),
  onGenCategoryChange = vi.fn(),
  onGenParamsChange = vi.fn(),
  onSessionModeChange = vi.fn(),
  selectedModel = 'openai:gpt-5.5',
  sessionMode = 'agent',
  inputCatalog,
  inputCatalogPhase,
  inputCatalogBindingKind,
  configurationPolicy,
  availableModels = chatModels,
  availableMediaModels = mediaModels,
  mediaModelSelection = {
    image: 'image-provider:model-image',
    video: 'none',
    audio: 'none',
  },
  mediaUnderstandingModels,
  selectedFileReferences = [],
  onSelectedFileReferencesChange = vi.fn(),
  isBusy = false,
  composerWorkspace,
  children,
}: {
  readonly ambientNodes?: import('@neko/agent-contracts').AmbientCanvasNode[];
  readonly contextChips?: AgentContextPayload[];
  readonly conversationKind?: ConversationKind;
  readonly onRemoveContextChip?: (id: string) => void;
  readonly onAddContextChip?: React.ComponentProps<typeof InputAreaProvider>['onAddContextChip'];
  readonly mentionItems?: readonly MentionItemFixture[];
  readonly onRequestFiles?: React.ComponentProps<typeof InputAreaProvider>['onRequestFiles'];
  readonly onModelSelect?: React.ComponentProps<typeof InputAreaProvider>['onModelSelect'];
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
  readonly inputCatalog?: readonly AgentInputCatalogEntry[];
  readonly inputCatalogPhase?: React.ComponentProps<typeof InputAreaProvider>['inputCatalogPhase'];
  readonly inputCatalogBindingKind?: React.ComponentProps<
    typeof InputAreaProvider
  >['inputCatalogBindingKind'];
  readonly configurationPolicy?: AgentConfigurationPolicyProjection;
  readonly availableModels?: ChatModelOption[];
  readonly availableMediaModels?: ChatModelOption[];
  readonly mediaModelSelection?: React.ComponentProps<
    typeof InputAreaProvider
  >['mediaModelSelection'];
  readonly mediaUnderstandingModels?: MediaUnderstandingModels;
  readonly selectedFileReferences?: readonly SelectedFileReferenceFixture[];
  readonly onSelectedFileReferencesChange?: React.ComponentProps<
    typeof InputArea
  >['onSelectedFileReferencesChange'];
  readonly isBusy?: boolean;
  readonly composerWorkspace?: AgentComposerWorkspacePresentation;
  readonly children: React.ReactNode;
}) {
  const inputArea = (
    <InputAreaProvider
      isBusy={isBusy}
      selectedModel={selectedModel}
      availableModels={availableModels}
      onModelSelect={onModelSelect}
      mediaModelSelection={mediaModelSelection}
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
      inputCatalog={inputCatalog}
      inputCatalogPhase={inputCatalogPhase}
      inputCatalogBindingKind={inputCatalogBindingKind}
      configurationPolicy={configurationPolicy}
      onRequestFiles={onRequestFiles}
      mentionItems={mentionItems.map(normalizeMentionItem)}
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
        selectedFileReferences: selectedFileReferences.map(normalizeSelectedFileReference),
        onSelectedFileReferencesChange,
      })}
    </InputAreaProvider>
  );
  return composerWorkspace ? (
    <ComposerWorkspaceProvider value={composerWorkspace}>{inputArea}</ComposerWorkspaceProvider>
  ) : (
    inputArea
  );
}

type MentionItemFixture = Omit<MentionItem, 'contentLocator'> & {
  readonly contentLocator?: MentionItem['contentLocator'];
  readonly filePath?: string;
};

type SelectedFileReferenceFixture = Omit<SelectedFileReference, 'contentLocator'> & {
  readonly contentLocator?: SelectedFileReference['contentLocator'];
  readonly path?: string;
};

function normalizeMentionItem(item: MentionItemFixture): MentionItem {
  const { filePath, ...rest } = item;
  return {
    ...rest,
    ...(rest.contentLocator
      ? { contentLocator: rest.contentLocator }
      : filePath
        ? { contentLocator: { kind: 'workspace-file', path: filePath } }
        : {}),
  };
}

function normalizeSelectedFileReference(
  reference: SelectedFileReferenceFixture,
): SelectedFileReference {
  const { path, ...rest } = reference;
  if (rest.contentLocator) return { ...rest, contentLocator: rest.contentLocator };
  if (!path) throw new Error(`Selected file reference '${reference.id}' requires a path.`);
  return { ...rest, contentLocator: { kind: 'workspace-file', path } };
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
