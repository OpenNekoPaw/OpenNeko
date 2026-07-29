import type { SupportedLocale } from '@neko/shared';

export interface ResourceBrowserLabels {
  readonly title: string;
  readonly all: string;
  readonly files: string;
  readonly media: string;
  readonly entities: string;
  readonly search: string;
  readonly searchPlaceholder: string;
  readonly refresh: string;
  readonly addSource: string;
  readonly relinkSource: string;
  readonly removeSource: string;
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
    all: 'All',
    files: 'Files',
    media: 'Media',
    entities: 'Entities',
    search: 'Search',
    searchPlaceholder: 'Search project resources…',
    refresh: 'Refresh',
    addSource: 'Add source',
    relinkSource: 'Relink media library',
    removeSource: 'Remove media library',
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
    all: '全部',
    files: '目录',
    media: '媒体',
    entities: '实体',
    search: '搜索',
    searchPlaceholder: '搜索项目资源…',
    refresh: '刷新',
    addSource: '添加来源',
    relinkSource: '重新链接媒体库',
    removeSource: '移除媒体库',
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
