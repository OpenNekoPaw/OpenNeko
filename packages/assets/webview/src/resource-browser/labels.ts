import type { SupportedLocale } from '@neko/ui/i18n';

export interface ResourceBrowserLabels {
  readonly title: string;
  readonly files: string;
  readonly media: string;
  readonly assets: string;
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly createMenu: string;
  readonly rescan: string;
  readonly configureMediaLibraries: string;
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
  readonly characterCreationIncomplete: string;
  readonly retryCharacterCreation: string;
}

const labels: Record<SupportedLocale, ResourceBrowserLabels> = {
  en: {
    title: 'Resources',
    files: 'Project files',
    media: 'Shared media',
    assets: 'Installed assets',
    search: 'Search',
    searchPlaceholder: 'Search project resources…',
    createMenu: 'New',
    rescan: 'Rescan',
    configureMediaLibraries: 'Configure media libraries',
    linkGlobalLibrary: 'Link global media library',
    addDirectoryLibrary: 'Add directory as media library',
    relinkSource: 'Relink media library',
    removeSource: 'Remove media library',
    removeSourceConfirm:
      'Remove this workspace link? Referenced items will remain visible as missing.',
    createFile: 'New file',
    createDirectory: 'New folder',
    createCanvas: 'New Canvas',
    createCut: 'New Cut',
    createTarget: 'Create in {target}',
    entryName: 'File or folder name',
    trashContent: 'Move to Trash',
    trashContentConfirm: 'Move this workspace item to Trash?',
    confirm: 'Create',
    recoverSource: 'Recover media library',
    recoveryTitle: 'Recover media library',
    recoveryUseGlobal: 'Use global connection',
    recoverySelectDirectory: 'Choose directory',
    recoveryConfirm: 'Confirm recovery',
    recoveryCancel: 'Cancel',
    recoveryReferences: 'referenced entries',
    statusAvailable: 'Available',
    statusRequiredUnlinked: 'Required library is not linked',
    statusConnectionMissing: 'Global connection is missing',
    statusTargetUnavailable: 'Library target is unavailable',
    statusContentIncomplete: 'Referenced content is incomplete',
    statusBindingInvalid: 'The project-local binding record is invalid',
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
    mediaLibraries: 'Media libraries',
    createCharacter: 'Create Character from this resource',
    characterName: 'Character name',
    characterDestination: 'Create in {destination}',
    characterCreationIncomplete: 'The Character was created, but project linking is incomplete.',
    retryCharacterCreation: 'Retry linking',
  },
  'zh-cn': {
    title: '资源',
    files: '项目文件',
    media: '共享媒体',
    assets: '已安装素材',
    search: '搜索',
    searchPlaceholder: '搜索项目资源…',
    createMenu: '新建',
    rescan: '重新扫描',
    configureMediaLibraries: '配置媒体库',
    linkGlobalLibrary: '关联全局媒体库',
    addDirectoryLibrary: '将目录添加为媒体库',
    relinkSource: '重新链接媒体库',
    removeSource: '移除媒体库',
    removeSourceConfirm: '确认移除此工作区链接？项目引用仍会保留，并显示为缺失。',
    createFile: '新建文件',
    createDirectory: '新建目录',
    createCanvas: '新建画布',
    createCut: '新建剪辑',
    createTarget: '创建于 {target}',
    entryName: '文件或目录名称',
    trashContent: '移到废纸篓',
    trashContentConfirm: '确认将此工作区项目移到废纸篓？',
    confirm: '创建',
    recoverSource: '恢复媒体库',
    recoveryTitle: '恢复媒体库',
    recoveryUseGlobal: '使用全局连接',
    recoverySelectDirectory: '选择目录',
    recoveryConfirm: '确认恢复',
    recoveryCancel: '取消',
    recoveryReferences: '个引用条目',
    statusAvailable: '可用',
    statusRequiredUnlinked: '项目需要此媒体库，但尚未链接',
    statusConnectionMissing: '全局媒体库连接缺失',
    statusTargetUnavailable: '媒体库目标不可用',
    statusContentIncomplete: '部分引用素材缺失',
    statusBindingInvalid: '项目本地媒体库绑定记录无效',
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
    mediaLibraries: '媒体库',
    createCharacter: '基于此资源创建角色',
    characterName: '角色名称',
    characterDestination: '创建到 {destination}',
    characterCreationIncomplete: '角色已创建，但项目关联尚未完成。',
    retryCharacterCreation: '重试关联',
  },
};

export function getResourceBrowserLabels(locale: SupportedLocale): ResourceBrowserLabels {
  return labels[locale];
}
