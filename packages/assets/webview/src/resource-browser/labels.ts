import type { SupportedLocale } from '@neko/ui/i18n';

export interface ResourceBrowserLabels {
  readonly title: string;
  readonly files: string;
  readonly media: string;
  readonly assets: string;
  readonly search: string;
  readonly searchFilesPlaceholder: string;
  readonly searchMediaPlaceholder: string;
  readonly searchAssetsPlaceholder: string;
  readonly createMenu: string;
  readonly importFiles: string;
  readonly rescan: string;
  readonly linkGlobalLibrary: string;
  readonly addDirectoryLibrary: string;
  readonly relinkSource: string;
  readonly removeSource: string;
  readonly removeSourceConfirm: string;
  readonly createFile: string;
  readonly createDirectory: string;
  readonly createCanvas: string;
  readonly createCut: string;
  readonly createTarget: string;
  readonly entryName: string;
  readonly trashContent: string;
  readonly trashContentConfirm: string;
  readonly confirm: string;
  readonly recoverSource: string;
  readonly recoveryTitle: string;
  readonly recoveryUseGlobal: string;
  readonly recoverySelectDirectory: string;
  readonly recoveryConfirm: string;
  readonly recoveryCancel: string;
  readonly recoveryReferences: string;
  readonly noAvailableRecoverySource: string;
  readonly statusAvailable: string;
  readonly statusRequiredUnlinked: string;
  readonly statusConnectionMissing: string;
  readonly statusTargetUnavailable: string;
  readonly statusContentIncomplete: string;
  readonly statusBindingInvalid: string;
  readonly statusUnreferencedLocalBinding: string;
  readonly preview: string;
  readonly editText: string;
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
  readonly mainViewCapacityReached: string;
  readonly dismiss: string;
  readonly listView: string;
  readonly gridView: string;
  readonly breadcrumbs: string;
  readonly workspaceRoot: string;
  readonly mediaLibraries: string;
  readonly createCharacter: string;
  readonly characterName: string;
  readonly characterDestination: string;
}

const labels: Record<SupportedLocale, ResourceBrowserLabels> = {
  en: {
    title: 'Resources',
    files: 'Project files',
    media: 'External media',
    assets: 'Assets',
    search: 'Search',
    searchFilesPlaceholder: 'Search project files…',
    searchMediaPlaceholder: 'Search external media…',
    searchAssetsPlaceholder: 'Search assets…',
    createMenu: 'New',
    importFiles: 'Import files',
    rescan: 'Rescan',
    linkGlobalLibrary: 'Associate global Media Library',
    addDirectoryLibrary: 'Add directory to global Media Library',
    relinkSource: 'Reconnect external media',
    removeSource: 'Remove external source',
    removeSourceConfirm:
      'Remove this project association and its workspace link? Referenced items will remain visible as missing.',
    createFile: 'New file',
    createDirectory: 'New folder',
    createCanvas: 'New Canvas',
    createCut: 'New Cut',
    createTarget: 'Create in {target}',
    entryName: 'File or folder name',
    trashContent: 'Move to Trash',
    trashContentConfirm: 'Move this workspace item to Trash?',
    confirm: 'Create',
    recoverSource: 'Reconnect external media',
    recoveryTitle: 'Reconnect external media',
    recoveryUseGlobal: 'Use an existing source',
    recoverySelectDirectory: 'Choose directory',
    recoveryConfirm: 'Confirm recovery',
    recoveryCancel: 'Cancel',
    recoveryReferences: 'referenced entries',
    noAvailableRecoverySource: 'No matching available external source was found.',
    statusAvailable: 'Available',
    statusRequiredUnlinked: 'Required external source is not connected',
    statusConnectionMissing: 'External source connection is missing',
    statusTargetUnavailable: 'External source is unavailable',
    statusContentIncomplete: 'Referenced content is incomplete',
    statusBindingInvalid: 'The local external-source binding is invalid',
    statusUnreferencedLocalBinding: 'Bound locally but not referenced by project content',
    preview: 'Preview',
    editText: 'Edit text',
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
    mainViewCapacityReached:
      'Up to {maximum} Main Views can be open. Close one before opening this resource.',
    dismiss: 'Dismiss',
    listView: 'List view',
    gridView: 'Grid view',
    breadcrumbs: 'Resource location',
    workspaceRoot: 'Workspace',
    mediaLibraries: 'External media',
    createCharacter: 'Create Character from this resource',
    characterName: 'Character name',
    characterDestination: 'Create in {destination}',
  },
  'zh-cn': {
    title: '资源',
    files: '项目文件',
    media: '外部媒体',
    assets: '素材',
    search: '搜索',
    searchFilesPlaceholder: '搜索项目文件…',
    searchMediaPlaceholder: '搜索外部媒体…',
    searchAssetsPlaceholder: '搜索素材…',
    createMenu: '新建',
    importFiles: '导入文件',
    rescan: '重新扫描',
    linkGlobalLibrary: '关联全局媒体库',
    addDirectoryLibrary: '将目录添加到全局媒体库',
    relinkSource: '重新连接外部媒体',
    removeSource: '移除外部来源',
    removeSourceConfirm: '确认移除此项目关联及工作区链接？项目引用仍会保留，并显示为缺失。',
    createFile: '新建文件',
    createDirectory: '新建目录',
    createCanvas: '新建画布',
    createCut: '新建剪辑',
    createTarget: '创建于 {target}',
    entryName: '文件或目录名称',
    trashContent: '移到废纸篓',
    trashContentConfirm: '确认将此工作区项目移到废纸篓？',
    confirm: '创建',
    recoverSource: '重新连接外部媒体',
    recoveryTitle: '重新连接外部媒体',
    recoveryUseGlobal: '使用已有来源',
    recoverySelectDirectory: '选择目录',
    recoveryConfirm: '确认恢复',
    recoveryCancel: '取消',
    recoveryReferences: '个引用条目',
    noAvailableRecoverySource: '没有找到名称匹配且可用的外部媒体来源。',
    statusAvailable: '可用',
    statusRequiredUnlinked: '项目需要此外部来源，但尚未连接',
    statusConnectionMissing: '外部来源连接缺失',
    statusTargetUnavailable: '外部来源不可用',
    statusContentIncomplete: '部分引用素材缺失',
    statusBindingInvalid: '项目本地外部来源绑定无效',
    statusUnreferencedLocalBinding: '已有本地绑定，但项目内容暂未引用',
    preview: '预览',
    editText: '编辑文本',
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
    mainViewCapacityReached: '最多可打开 {maximum} 个主视图。请先关闭一个，再打开此资源。',
    dismiss: '关闭提示',
    listView: '列表视图',
    gridView: '网格视图',
    breadcrumbs: '资源位置',
    workspaceRoot: '工作区',
    mediaLibraries: '外部媒体',
    createCharacter: '基于此资源创建角色',
    characterName: '角色名称',
    characterDestination: '创建到 {destination}',
  },
};

export function getResourceBrowserLabels(locale: SupportedLocale): ResourceBrowserLabels {
  return labels[locale];
}
