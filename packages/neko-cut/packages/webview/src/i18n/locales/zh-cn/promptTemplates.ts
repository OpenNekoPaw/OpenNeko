import type { MessageBundle } from '@neko/shared';

export const promptTemplates = {
  'promptTemplates.title': '提示词模板',
  'promptTemplates.all': '全部',
  'promptTemplates.categories.editing': '编辑',
  'promptTemplates.categories.generation': '生成',
  'promptTemplates.categories.analysis': '分析',
  'promptTemplates.categories.custom': '自定义',

  'promptTemplates.noTemplates': '该分类下暂无模板',
  'promptTemplates.backToList': '返回列表',
  'promptTemplates.parameters': '参数设置',
  'promptTemplates.preview': '预览',
  'promptTemplates.useTemplate': '使用此模板',
  'promptTemplates.templates.trimSilence.name': '裁剪静音',
  'promptTemplates.templates.trimSilence.description': '自动检测并裁剪视频中的静音片段',
  'promptTemplates.templates.trimSilence.prompt':
    '请分析当前选中的视频片段，找出音频静音超过 {{threshold}} 秒的部分，并帮我裁剪掉这些静音片段。',
  'promptTemplates.templates.trimSilence.threshold': '静音阈值(秒)',
  'promptTemplates.templates.autoSubtitles.name': '自动字幕',
  'promptTemplates.templates.autoSubtitles.description': '为选中的视频片段生成字幕',
  'promptTemplates.templates.autoSubtitles.prompt':
    '请为当前选中的视频片段生成字幕。使用 {{language}} 语言，字幕风格为 {{style}}。',
  'promptTemplates.templates.autoSubtitles.language': '语言',
  'promptTemplates.templates.autoSubtitles.style': '风格',
  'promptTemplates.templates.autoSubtitles.languages.chinese': '中文',
  'promptTemplates.templates.autoSubtitles.languages.english': '英文',
  'promptTemplates.templates.autoSubtitles.languages.japanese': '日文',
  'promptTemplates.templates.autoSubtitles.styles.formal': '正式',
  'promptTemplates.templates.autoSubtitles.styles.casual': '口语化',
  'promptTemplates.templates.autoSubtitles.styles.humorous': '幽默',
  'promptTemplates.templates.matchCut.name': '匹配剪辑',
  'promptTemplates.templates.matchCut.description': '根据音乐节拍自动剪辑',
  'promptTemplates.templates.matchCut.prompt':
    '请分析音频轨道的节拍，并在每个节拍点自动分割视频轨道的片段，创建匹配音乐节奏的剪辑。',
  'promptTemplates.templates.colorCorrection.name': '色彩校正',
  'promptTemplates.templates.colorCorrection.description': '自动调整视频色彩平衡',
  'promptTemplates.templates.colorCorrection.prompt':
    '请分析选中视频的色彩，并给出色彩校正建议。目标风格为 {{style}}。',
  'promptTemplates.templates.colorCorrection.targetStyle': '目标风格',
  'promptTemplates.templates.colorCorrection.styleOptions.cinematic': '电影感',
  'promptTemplates.templates.colorCorrection.styleOptions.fresh': '清新',
  'promptTemplates.templates.colorCorrection.styleOptions.vintage': '复古',
  'promptTemplates.templates.colorCorrection.styleOptions.highContrast': '高对比',
  'promptTemplates.templates.generateBRoll.name': '生成B-Roll',
  'promptTemplates.templates.generateBRoll.description': '根据主视频内容生成补充画面',
  'promptTemplates.templates.generateBRoll.prompt':
    '分析当前视频的内容，为以下时间段生成合适的B-Roll补充画面：{{timeRange}}。风格要求：{{style}}。',
  'promptTemplates.templates.generateBRoll.timeRange': '时间范围',
  'promptTemplates.templates.generateBRoll.style': '风格',
  'promptTemplates.templates.generateThumbnail.name': '生成封面',
  'promptTemplates.templates.generateThumbnail.description': '为视频生成吸引人的封面图',
  'promptTemplates.templates.generateThumbnail.prompt':
    '请根据当前视频的内容，生成一张吸引人的封面图。要求：{{requirements}}。',
  'promptTemplates.templates.generateThumbnail.requirements': '要求',
  'promptTemplates.templates.generateTransition.name': '生成转场',
  'promptTemplates.templates.generateTransition.description': '为相邻片段生成平滑转场效果',
  'promptTemplates.templates.generateTransition.prompt':
    '请为选中的 {{count}} 个相邻视频片段之间生成合适的转场效果。转场类型：{{transitionType}}。',
  'promptTemplates.templates.generateTransition.clipCount': '片段数量',
  'promptTemplates.templates.generateTransition.transitionType': '转场类型',
  'promptTemplates.templates.generateTransition.transitionTypes.fade': '渐变',
  'promptTemplates.templates.generateTransition.transitionTypes.slide': '滑动',
  'promptTemplates.templates.generateTransition.transitionTypes.zoom': '缩放',
  'promptTemplates.templates.generateTransition.transitionTypes.rotate': '旋转',
  'promptTemplates.templates.generateTransition.transitionTypes.auto': '自动',
  'promptTemplates.templates.analyzePacing.name': '分析节奏',
  'promptTemplates.templates.analyzePacing.description': '分析视频剪辑节奏并提供优化建议',
  'promptTemplates.templates.analyzePacing.prompt':
    '请分析当前项目的剪辑节奏，包括：1) 片段时长分布 2) 转场频率 3) 镜头类型变化。并提供优化建议。',
  'promptTemplates.templates.checkContinuity.name': '检查连贯性',
  'promptTemplates.templates.checkContinuity.description': '检查视频片段之间的视觉连贯性',
  'promptTemplates.templates.checkContinuity.prompt':
    '请检查当前时间轴上相邻片段之间的视觉连贯性，找出可能的跳跃剪辑或不协调的地方。',
  'promptTemplates.templates.analyzeAudio.name': '音频分析',
  'promptTemplates.templates.analyzeAudio.description': '分析音频质量和问题',
  'promptTemplates.templates.analyzeAudio.prompt':
    '请分析当前视频的音频轨道，检查：1) 音量是否均衡 2) 是否有噪音 3) 人声是否清晰。并给出改进建议。',
  'promptTemplates.templates.contentSummary.name': '内容摘要',
  'promptTemplates.templates.contentSummary.description': '生成视频内容的简要摘要',
  'promptTemplates.templates.contentSummary.prompt':
    '请分析当前视频的内容，生成一份简要摘要，包括：主题、关键场景、时长和适用平台建议。',
} as const satisfies MessageBundle;
