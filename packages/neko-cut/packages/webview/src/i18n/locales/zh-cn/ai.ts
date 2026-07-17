import type { MessageBundle } from '@neko/shared';

export const ai = {
  'ai.action.title': 'AI 操作',
  'ai.action.button': 'AI',
  'ai.action.generateVariant': '生成变体',
  'ai.action.extendVideo': '扩展时长',
  'ai.action.describeContent': '描述内容',
  'ai.action.extractKeyframes': '提取关键帧',
  'ai.action.imageToVideo': '图生视频',
  'ai.action.editImage': '编辑图像',
  'ai.action.upscale': '超分辨率',
  'ai.action.translate': '翻译',
  'ai.action.rewrite': '改写',
  'ai.action.generateVoiceover': '生成配音',
  'ai.action.transcribe': '语音转文字',
  'ai.action.unifyStyle': '风格统一',

  'ai.panel.actions': '操作',
  'ai.panel.templates': '模板',
  'ai.panel.selectElement': '选择元素以查看可用操作',
  'ai.panel.noTemplates': '暂无可用模板',
} as const satisfies MessageBundle;
