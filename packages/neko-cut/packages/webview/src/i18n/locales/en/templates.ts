import type { MessageBundle } from '@neko/shared';

export const templates = {
  'templates.title': 'AI Templates',
  'templates.button': 'Templates',
  'templates.searchPlaceholder': 'Search templates...',
  'templates.noTemplates': 'No templates found',
  'templates.totalCount': '{count} templates',
  'templates.builtin': 'Built-in',
  'templates.execute': 'Execute template',
  'templates.executing': 'Executing...',
  'templates.cancel': 'Cancel',
  'templates.dismiss': 'Dismiss',
  'templates.failed': 'failed',
  'templates.category.all': 'All',
  'templates.category.editing': 'Editing',
  'templates.category.generation': 'Generation',
  'templates.category.analysis': 'Analysis',
  'templates.category.custom': 'Custom',
} as const satisfies MessageBundle;
