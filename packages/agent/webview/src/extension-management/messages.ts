import type { MessageBundle } from '@neko/ui/i18n';

const en = {
  'extension.empty.mcpUnconfigured': 'No MCP servers configured',
  'extension.detail.capabilityInfo': 'Capability information',
  'extension.detail.close': 'Close extension details',
  'extension.detail.identity': 'Identity',
  'extension.detail.invocation': 'Invocation',
  'extension.detail.modelInvocable': 'Model invocable',
  'extension.detail.notModelInvocable': 'Not model invocable',
  'extension.detail.notUserInvocable': 'Not user invocable',
  'extension.detail.provider': 'Provider',
  'extension.detail.source': 'Source',
  'extension.detail.status': 'Status',
  'extension.detail.userInvocable': 'User invocable',
  'extension.detail.whenToUse': 'When to use',
  'skill.catalog.invocation.user': 'user',
  'skill.catalog.invocation.model': 'model',
  'skill.catalog.audio-mixing.title': 'Audio mixing',
  'skill.catalog.audio-mixing.summary':
    'Mix audio, balance music and dialogue, normalize levels, fade, and apply ducking.',
  'skill.catalog.character-creator.title': 'Character creation',
  'skill.catalog.character-creator.summary':
    'Create a reviewable character from a concept, prompt, or authorized source.',
  'skill.catalog.color-grading.title': 'Color grading',
  'skill.catalog.color-grading.summary':
    'Adjust exposure, contrast, white balance, saturation, LUTs, and cinematic looks.',
  'skill.catalog.content-authoring.title': 'Content authoring',
  'skill.catalog.content-authoring.summary':
    'Create concise, progressive creative proposals, reports, plans, and prompt packages.',
  'skill.catalog.image.title': 'Image generation and editing',
  'skill.catalog.image.summary':
    'Generate, edit, extend, enhance, compose, split, or prepare images.',
  'skill.catalog.media-production.title': 'Media production',
  'skill.catalog.media-production.summary':
    'Guide an adaptive path from available sources to a verified deliverable.',
  'skill.catalog.media-quality-review.title': 'Media quality review',
  'skill.catalog.media-quality-review.summary':
    'Review creative assets and deliverables against revision-bound evidence.',
  'skill.catalog.scene-to-music.title': 'Scene to music',
  'skill.catalog.scene-to-music.summary':
    'Plan scene-aware background music and hand off to available generation capabilities.',
  'skill.catalog.script-generation.title': 'Script writing',
  'skill.catalog.script-generation.summary':
    'Create or revise screenplays, story structure, character arcs, and Fountain scripts.',
  'skill.catalog.script-to-timeline.title': 'Script to timeline',
  'skill.catalog.script-to-timeline.summary':
    'Convert a screenplay or Fountain script into a timeline or video project.',
  'skill.catalog.skill-creator.title': 'Skill creation',
  'skill.catalog.skill-creator.summary':
    'Create, validate, or refine reusable DeepSeek Harness Skills.',
  'skill.catalog.storyboard.title': 'Storyboard creation',
  'skill.catalog.storyboard.summary':
    'Explore source material and create structured Storyboards when explicitly requested.',
  'skill.catalog.subtitle-assistant.title': 'Subtitle assistant',
  'skill.catalog.subtitle-assistant.summary':
    'Create, edit, time, translate, import, or export subtitles and captions.',
  'skill.catalog.video.title': 'Video generation',
  'skill.catalog.video.summary':
    'Generate or transform one video clip from prompts, images, keyframes, or video references.',
  'skill.catalog.video-editing.title': 'Video editing',
  'skill.catalog.video-editing.summary':
    'Edit timelines, trim or split clips, merge media, add transitions, and adjust timing.',
  'skill.catalog.world-creator.title': 'World creation',
  'skill.catalog.world-creator.summary':
    'Create a reviewable world from a concept or authorized source.',
} as const satisfies MessageBundle;

const zhCn = {
  'extension.empty.mcpUnconfigured': '尚未配置 MCP',
  'extension.detail.capabilityInfo': '能力信息',
  'extension.detail.close': '关闭扩展详情',
  'extension.detail.identity': '标识',
  'extension.detail.invocation': '调用方式',
  'extension.detail.modelInvocable': '模型可调用',
  'extension.detail.notModelInvocable': '模型不可调用',
  'extension.detail.notUserInvocable': '用户不可调用',
  'extension.detail.provider': '提供方',
  'extension.detail.source': '来源',
  'extension.detail.status': '状态',
  'extension.detail.userInvocable': '用户可调用',
  'extension.detail.whenToUse': '适用场景',
  'skill.catalog.invocation.user': '用户可调用',
  'skill.catalog.invocation.model': '模型可调用',
  'skill.catalog.audio-mixing.title': '音频混合',
  'skill.catalog.audio-mixing.summary': '混合音频、平衡音乐与对白、标准化响度，并处理淡化和闪避。',
  'skill.catalog.character-creator.title': '角色创作',
  'skill.catalog.character-creator.summary': '根据概念、提示词或已授权来源创建可评审角色。',
  'skill.catalog.color-grading.title': '色彩校正',
  'skill.catalog.color-grading.summary': '调整曝光、对比度、白平衡、饱和度、LUT 和电影感风格。',
  'skill.catalog.content-authoring.title': '内容创作',
  'skill.catalog.content-authoring.summary':
    '渐进生成简洁一致的创作方案、分析报告、企划、计划和提示词包。',
  'skill.catalog.image.title': '图像生成与编辑',
  'skill.catalog.image.summary': '生成、编辑、扩展、增强、合成、拆分或准备图像。',
  'skill.catalog.media-production.title': '媒体制作',
  'skill.catalog.media-production.summary': '根据现有来源规划到可验证交付物的自适应制作路径。',
  'skill.catalog.media-quality-review.title': '媒体质量评审',
  'skill.catalog.media-quality-review.summary': '依据明确版本和证据评审创作素材与最终交付物。',
  'skill.catalog.scene-to-music.title': '场景配乐',
  'skill.catalog.scene-to-music.summary': '规划与场景匹配的背景音乐，并交给当前可用的生成能力。',
  'skill.catalog.script-generation.title': '剧本创作',
  'skill.catalog.script-generation.summary': '创作或修改剧本、故事结构、角色弧线和 Fountain 文本。',
  'skill.catalog.script-to-timeline.title': '剧本转时间线',
  'skill.catalog.script-to-timeline.summary': '把剧本或 Fountain 文本转换为时间线或视频项目。',
  'skill.catalog.skill-creator.title': 'Skill 创作',
  'skill.catalog.skill-creator.summary': '创建、验证或改进可复用的 DeepSeek Harness Skill。',
  'skill.catalog.storyboard.title': '分镜创作',
  'skill.catalog.storyboard.summary': '探索来源内容，并在明确需要时创建结构化分镜。',
  'skill.catalog.subtitle-assistant.title': '字幕助手',
  'skill.catalog.subtitle-assistant.summary': '创建、编辑、对时、翻译、导入或导出字幕。',
  'skill.catalog.video.title': '视频生成',
  'skill.catalog.video.summary': '根据提示词、图像、关键帧或视频参考生成或转换单个视频片段。',
  'skill.catalog.video-editing.title': '视频剪辑',
  'skill.catalog.video-editing.summary':
    '编辑时间线、裁剪或拆分片段、合并媒体、添加转场并调整时序。',
  'skill.catalog.world-creator.title': '世界观创作',
  'skill.catalog.world-creator.summary': '根据概念或已授权来源创建可评审世界观。',
} as const satisfies MessageBundle;

export const agentExtensionManagementMessages = Object.freeze({ en, 'zh-cn': zhCn });
