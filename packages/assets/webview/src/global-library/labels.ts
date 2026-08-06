import type { SupportedLocale } from '@neko/ui/i18n';

export interface GlobalLibraryLabels {
  readonly eyebrow: string;
  readonly titleMedia: string;
  readonly titleAssets: string;
  readonly descriptionMedia: string;
  readonly descriptionAssets: string;
  readonly searchMedia: string;
  readonly searchAssets: string;
  readonly list: string;
  readonly grid: string;
  readonly refresh: string;
  readonly importAssets: string;
  readonly addLibrary: string;
  readonly location: string;
  readonly local: string;
  readonly nas: string;
  readonly cloud: string;
  readonly empty: string;
  readonly loading: string;
  readonly actions: string;
  readonly reveal: string;
  readonly relink: string;
  readonly removeConnection: string;
  readonly removeAsset: string;
  readonly removeConnectionConfirm: string;
  readonly removeAssetConfirm: string;
  readonly selectedCount: string;
  readonly moveTo: string;
  readonly removeSelected: string;
  readonly clearSelection: string;
  readonly selectAll: string;
  readonly removeSelectedConfirm: string;
  readonly nameAscending: string;
  readonly nameDescending: string;
  readonly newest: string;
  readonly sort: string;
  readonly breadcrumb: string;
  readonly root: string;
  readonly cancelled: string;
  readonly imported: string;
  readonly removed: string;
  readonly relinked: string;
  readonly revealed: string;
  readonly moved: string;
}

const labels: Record<'en' | 'zh-cn', GlobalLibraryLabels> = {
  en: {
    eyebrow: 'Global catalog',
    titleMedia: 'Media Library',
    titleAssets: 'Asset Library',
    descriptionMedia:
      'Manage reusable media connections without copying source files into every project.',
    descriptionAssets: 'Manage reusable creative assets available across projects.',
    searchMedia: 'Search media libraries',
    searchAssets: 'Search assets',
    list: 'List view',
    grid: 'Grid view',
    refresh: 'Refresh',
    importAssets: 'Import assets',
    addLibrary: 'Connect directory',
    location: 'Location type',
    local: 'Local',
    nas: 'NAS',
    cloud: 'Cloud',
    empty: 'No matching content',
    loading: 'Loading library',
    actions: 'Library actions',
    reveal: 'Show in file manager',
    relink: 'Relink directory',
    removeConnection: 'Remove connection',
    removeAsset: 'Remove Asset Library record',
    removeConnectionConfirm: 'Remove the connection to "{name}"? External files are preserved.',
    removeAssetConfirm:
      'Remove "{name}" from the Asset Library? The source file will be preserved.',
    selectedCount: '{count} selected',
    moveTo: 'Move to',
    removeSelected: 'Remove selected records',
    clearSelection: 'Clear selection',
    selectAll: 'Select all',
    removeSelectedConfirm:
      'Remove {count} selected records from the Asset Library? Source files will be preserved.',
    nameAscending: 'Name A-Z',
    nameDescending: 'Name Z-A',
    newest: 'Newest',
    sort: 'Sort',
    breadcrumb: 'Breadcrumb',
    root: 'Libraries',
    cancelled: 'Operation cancelled.',
    imported: 'Asset import finished.',
    removed: 'Removed.',
    relinked: 'Library relinked.',
    revealed: 'Shown in file manager.',
    moved: 'Files moved.',
  },
  'zh-cn': {
    eyebrow: '全局目录',
    titleMedia: '媒体库',
    titleAssets: '资产库',
    descriptionMedia: '管理可复用的媒体连接，无需将源文件复制到每个项目。',
    descriptionAssets: '管理可供多个项目复用的创作素材。',
    searchMedia: '搜索媒体库',
    searchAssets: '搜索资产',
    list: '列表视图',
    grid: '网格视图',
    refresh: '刷新',
    importAssets: '导入资产',
    addLibrary: '连接目录',
    location: '位置类型',
    local: '本地',
    nas: 'NAS',
    cloud: '云端',
    empty: '没有匹配内容',
    loading: '正在加载',
    actions: '媒体库操作',
    reveal: '在文件管理器中显示',
    relink: '重新定位目录',
    removeConnection: '移除连接',
    removeAsset: '移除素材记录',
    removeConnectionConfirm: '确定移除“{name}”的连接吗？外部文件会保留。',
    removeAssetConfirm: '确定从资产库移除“{name}”的素材记录吗？源文件会保留。',
    selectedCount: '已选择 {count} 项',
    moveTo: '移动到',
    removeSelected: '移除所选记录',
    clearSelection: '清除选择',
    selectAll: '全选',
    removeSelectedConfirm: '确定从资产库移除所选的 {count} 条记录吗？源文件会保留。',
    nameAscending: '名称 A-Z',
    nameDescending: '名称 Z-A',
    newest: '最近修改',
    sort: '排序',
    breadcrumb: '面包屑导航',
    root: '媒体库',
    cancelled: '操作已取消。',
    imported: '资产导入完成。',
    removed: '已移除。',
    relinked: '媒体库已重新定位。',
    revealed: '已在文件管理器中显示。',
    moved: '文件已移动。',
  },
};

export function getGlobalLibraryLabels(locale: SupportedLocale): GlobalLibraryLabels {
  return locale.toLocaleLowerCase().startsWith('zh') ? labels['zh-cn'] : labels.en;
}
