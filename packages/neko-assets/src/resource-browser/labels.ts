import type { SupportedLocale } from '@neko/shared';

export interface ResourceBrowserLabels {
  readonly title: string;
  readonly files: string;
  readonly media: string;
  readonly materials: string;
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly refresh: string;
  readonly configureMediaLibraries: string;
  readonly linkGlobalLibrary: string;
  readonly addDirectoryLibrary: string;
  readonly relinkSource: string;
  readonly removeSource: string;
  readonly removeSourceConfirm: string;
  readonly recoverSource: string;
  readonly recoveryTitle: string;
  readonly recoveryUseGlobal: string;
  readonly recoverySelectDirectory: string;
  readonly recoveryConfirm: string;
  readonly recoveryCancel: string;
  readonly recoveryReferences: string;
  readonly statusAvailable: string;
  readonly statusRequiredUnlinked: string;
  readonly statusGlobalConnectionMissing: string;
  readonly statusTargetUnavailable: string;
  readonly statusContentIncomplete: string;
  readonly statusEntryConflict: string;
  readonly statusUnreferencedLinked: string;
  readonly preview: string;
  readonly openCut: string;
  readonly addToCut: string;
  readonly cutConnecting: string;
  readonly itemCannotAddToCut: string;
  readonly reveal: string;
  readonly addToCanvas: string;
  readonly canvasConnecting: string;
  readonly itemCannotAddToCanvas: string;
  readonly openCanvas: string;
  readonly empty: string;
  readonly loading: string;
  readonly thumbnailUnavailable: string;
  readonly unavailable: string;
  readonly listView: string;
  readonly gridView: string;
  readonly breadcrumbs: string;
  readonly workspaceRoot: string;
  readonly mediaLibraries: string;
}

const labels: Record<SupportedLocale, ResourceBrowserLabels> = {
  en: {
    title: 'Resources',
    files: 'Files',
    media: 'Media',
    materials: 'Materials',
    search: 'Search',
    searchPlaceholder: 'Search project resources…',
    refresh: 'Refresh',
    configureMediaLibraries: 'Configure media libraries',
    linkGlobalLibrary: 'Link global media library',
    addDirectoryLibrary: 'Add directory as media library',
    relinkSource: 'Relink media library',
    removeSource: 'Remove media library',
    removeSourceConfirm:
      'Remove this workspace link? Referenced items will remain visible as missing.',
    recoverSource: 'Recover media library',
    recoveryTitle: 'Recover media library',
    recoveryUseGlobal: 'Use global connection',
    recoverySelectDirectory: 'Choose directory',
    recoveryConfirm: 'Confirm recovery',
    recoveryCancel: 'Cancel',
    recoveryReferences: 'referenced entries',
    statusAvailable: 'Available',
    statusRequiredUnlinked: 'Required library is not linked',
    statusGlobalConnectionMissing: 'Global connection is missing',
    statusTargetUnavailable: 'Library target is unavailable',
    statusContentIncomplete: 'Referenced content is incomplete',
    statusEntryConflict: 'A real workspace entry conflicts with this library',
    statusUnreferencedLinked: 'Linked but not referenced by project content',
    preview: 'Preview',
    openCut: 'Open in Cut',
    addToCut: 'Add to Cut',
    cutConnecting: 'Select an open Cut',
    itemCannotAddToCut: 'This resource cannot be added to Cut',
    reveal: 'Reveal',
    addToCanvas: 'Add to Canvas',
    canvasConnecting: 'Connecting to Canvas',
    itemCannotAddToCanvas: 'This resource cannot be added to Canvas',
    openCanvas: 'Open Canvas',
    empty: 'No matching resources',
    loading: 'Loading resources…',
    thumbnailUnavailable: 'Thumbnail unavailable',
    unavailable: 'Resource Browser unavailable',
    listView: 'List view',
    gridView: 'Grid view',
    breadcrumbs: 'Resource location',
    workspaceRoot: 'Workspace',
    mediaLibraries: 'Media libraries',
  },
  'zh-cn': {
    title: '资源',
    files: '目录',
    media: '媒体',
    materials: '素材',
    search: '搜索',
    searchPlaceholder: '搜索项目资源…',
    refresh: '刷新',
    configureMediaLibraries: '配置媒体库',
    linkGlobalLibrary: '关联全局媒体库',
    addDirectoryLibrary: '将目录添加为媒体库',
    relinkSource: '重新链接媒体库',
    removeSource: '移除媒体库',
    removeSourceConfirm: '确认移除此工作区链接？项目引用仍会保留，并显示为缺失。',
    recoverSource: '恢复媒体库',
    recoveryTitle: '恢复媒体库',
    recoveryUseGlobal: '使用全局连接',
    recoverySelectDirectory: '选择目录',
    recoveryConfirm: '确认恢复',
    recoveryCancel: '取消',
    recoveryReferences: '个引用条目',
    statusAvailable: '可用',
    statusRequiredUnlinked: '项目需要此媒体库，但尚未链接',
    statusGlobalConnectionMissing: '全局媒体库连接缺失',
    statusTargetUnavailable: '媒体库目标不可用',
    statusContentIncomplete: '部分引用素材缺失',
    statusEntryConflict: '工作区存在同名真实目录或文件',
    statusUnreferencedLinked: '已链接，但项目内容暂未引用',
    preview: '预览',
    openCut: '使用剪辑器打开',
    addToCut: '添加到剪辑',
    cutConnecting: '请选择已打开的剪辑',
    itemCannotAddToCut: '此资源不能添加到剪辑',
    reveal: '在文件夹中显示',
    addToCanvas: '添加到画布',
    canvasConnecting: '正在连接画布',
    itemCannotAddToCanvas: '此资源不能添加到画布',
    openCanvas: '打开画布',
    empty: '没有匹配的资源',
    loading: '正在加载资源…',
    thumbnailUnavailable: '缩略图不可用',
    unavailable: '资源库不可用',
    listView: '列表视图',
    gridView: '网格视图',
    breadcrumbs: '资源位置',
    workspaceRoot: '工作区',
    mediaLibraries: '媒体库',
  },
};

export function getResourceBrowserLabels(locale: SupportedLocale): ResourceBrowserLabels {
  return labels[locale];
}
