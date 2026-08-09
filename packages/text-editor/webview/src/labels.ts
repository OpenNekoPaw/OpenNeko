import {
  isTextDocumentDiagnosticCode,
  type TextDocumentDiagnosticCode,
  type TextEditorMarkdownMediaDiagnosticCode,
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
      'Preview is available, but Rich editing cannot preserve this syntax. Continue in Source.',
    richInitializationFailed: 'Rich editor could not be opened.',
    openSource: 'Open Source',
    revealMediaSource: 'Show in Source',
    mediaLoading: 'Loading media',
    unsavedChanges: 'Unsaved changes',
    completionSyntax: 'Markdown syntax',
    completionEntity: 'Entity',
    completionFile: 'File',
    completionMediaLibrary: 'Media library',
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
    richUnavailable: '当前内容可以预览，但所见即所得编辑无法保留该语法，请继续使用源码模式。',
    richInitializationFailed: '无法打开所见即所得编辑器。',
    openSource: '打开源码',
    revealMediaSource: '在源码中显示',
    mediaLoading: '正在加载媒体',
    unsavedChanges: '未保存的更改',
    completionSyntax: 'Markdown 语法',
    completionEntity: '实体',
    completionFile: '文件',
    completionMediaLibrary: '媒体库',
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

export function textEditorMarkdownMediaDiagnosticLabel(
  locale: TextEditorLocale,
  code: TextEditorMarkdownMediaDiagnosticCode,
): string {
  const labels: Record<TextEditorMarkdownMediaDiagnosticCode, readonly [string, string]> = {
    'text-editor-markdown-media-missing': ['Media file was not found', '找不到媒体文件'],
    'text-editor-markdown-media-ambiguous': [
      'Media target matches more than one resource',
      '媒体目标匹配到多个资源',
    ],
    'text-editor-markdown-media-unauthorized': [
      'Media target is not authorized for this Workspace',
      '当前工作区无权访问该媒体目标',
    ],
    'text-editor-markdown-media-unsupported': [
      'This resource type cannot be embedded',
      '不支持嵌入此资源类型',
    ],
    'text-editor-markdown-media-projection-failed': [
      'Media could not be displayed',
      '无法显示媒体',
    ],
    'text-editor-markdown-media-stale-surface': [
      'Media belongs to a previous document view',
      '媒体属于先前的文档视图',
    ],
  };
  return labels[code][locale === 'en' ? 0 : 1];
}

export { isTextDocumentDiagnosticCode as isTextEditorDiagnosticCode };
