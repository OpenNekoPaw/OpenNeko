import {
  isTextDocumentDiagnosticCode,
  type TextDocumentDiagnosticCode,
} from '@neko/text-editor-domain';

export type TextEditorLocale = 'en' | 'zh-cn';

const LABELS = {
  en: {
    save: 'Save',
    format: 'Format document',
    undo: 'Undo',
    redo: 'Redo',
    rich: 'Rich',
    source: 'Source',
    preview: 'Preview',
    split: 'Split',
    outline: 'Document outline',
    loading: 'Opening document',
    retry: 'Retry',
    emptyOutline: 'No headings',
    references: 'References',
    emptyReferences: 'No references',
    reload: 'Reload from disk',
    keepEditing: 'Keep editing',
    editor: 'Document editor',
    richEditor: 'Rich document editor',
    richLoading: 'Opening Rich editor',
    richUnavailable:
      'Rich editing cannot preserve this document. Use Source to keep its syntax intact.',
    richInitializationFailed: 'Rich editor could not be opened.',
    openSource: 'Open Source',
    unsavedChanges: 'Unsaved changes',
  },
  'zh-cn': {
    save: '保存',
    format: '格式化文档',
    undo: '撤销',
    redo: '重做',
    rich: '所见即所得',
    source: '源码',
    preview: '预览',
    split: '分栏',
    outline: '文档大纲',
    loading: '正在打开文档',
    retry: '重试',
    emptyOutline: '暂无标题',
    references: '引用',
    emptyReferences: '暂无引用',
    reload: '从磁盘重新加载',
    keepEditing: '继续编辑',
    editor: '文档编辑器',
    richEditor: '所见即所得文档编辑器',
    richLoading: '正在打开所见即所得编辑器',
    richUnavailable: '所见即所得编辑无法保留当前文档语法，请使用源码模式。',
    richInitializationFailed: '无法打开所见即所得编辑器。',
    openSource: '打开源码',
    unsavedChanges: '未保存的更改',
  },
} as const;

export type TextEditorLabelKey = keyof (typeof LABELS)['en'];

export function textEditorLabel(locale: TextEditorLocale, key: TextEditorLabelKey): string {
  return LABELS[locale][key];
}

export function textEditorDiagnosticLabel(
  locale: TextEditorLocale,
  code: TextDocumentDiagnosticCode,
): string {
  const labels: Record<TextDocumentDiagnosticCode, readonly [string, string]> = {
    'text-document-unsupported-extension': ['Unsupported text format', '不支持的文本格式'],
    'text-document-too-large': ['Document is too large to edit', '文档过大，无法编辑'],
    'text-document-invalid-utf8': ['Document is not valid UTF-8', '文档不是有效的 UTF-8'],
    'text-document-mixed-line-endings': [
      'Mixed line endings cannot be edited',
      '混合换行符无法编辑',
    ],
    'text-document-read-failed': ['Document could not be read', '无法读取文档'],
    'text-document-session-missing': ['Editor session is unavailable', '编辑会话不可用'],
    'text-document-identity-mismatch': ['Editor identity does not match', '编辑器身份不匹配'],
    'text-document-stale-edit-sequence': [
      'Document changed before this edit',
      '提交编辑前文档已发生变化',
    ],
    'text-document-request-reused': ['Edit request was already applied', '编辑请求已处理'],
    'text-document-invalid-change': ['Edit range is invalid', '编辑范围无效'],
    'text-document-invalid-json': ['JSON syntax is invalid', 'JSON 语法无效'],
    'text-document-save-conflict': ['File changed outside OpenNeko', '文件已在 OpenNeko 外部更改'],
    'text-document-save-failed': ['Document could not be saved', '无法保存文档'],
    'text-document-external-change-unavailable': [
      'External file change could not be read',
      '无法读取文件的外部更改',
    ],
    'text-document-reload-confirmation-required': [
      'Confirm before discarding edits',
      '放弃编辑前需要确认',
    ],
  };
  return labels[code][locale === 'en' ? 0 : 1];
}

export { isTextDocumentDiagnosticCode as isTextEditorDiagnosticCode };
