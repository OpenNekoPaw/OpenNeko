import type { MessageBundle } from '@neko/shared';

export const templates = {
  'templates.title': 'AI 模板',
  'templates.button': '模板',
  'templates.searchPlaceholder': '搜索模板...',
  'templates.noTemplates': '未找到模板',
  'templates.totalCount': '共 {count} 个模板',
  'templates.builtin': '内置',
  'templates.execute': '执行模板',
  'templates.executing': '执行中...',
  'templates.cancel': '取消',
  'templates.dismiss': '关闭',
  'templates.failed': '失败',
  'templates.category.all': '全部',
  'templates.category.editing': '编辑',
  'templates.category.generation': '生成',
  'templates.category.analysis': '分析',
  'templates.category.custom': '自定义',
} as const satisfies MessageBundle;
