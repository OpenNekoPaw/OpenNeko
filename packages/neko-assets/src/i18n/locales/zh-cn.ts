/**
 * Chinese translations for neko-assets
 */

import type { AssetTranslations } from './en';

export const zhCn: AssetTranslations = {
  // Media Library Management
  'mediaLibrary.add.title': '选择媒体库目录',
  'mediaLibrary.add.namePrompt': '输入媒体库名称',
  'mediaLibrary.add.namePlaceholder': '例如：团队素材',
  'mediaLibrary.add.variablePrompt': '确认或修改路径变量名（已根据库名自动生成）',
  'mediaLibrary.add.variablePlaceholder': '例如：TEAM_FOOTAGE',
  'mediaLibrary.add.variableError': '变量名必须是大写下划线格式',
  'mediaLibrary.add.success': '媒体库 "{name}" 已添加',
  'mediaLibrary.add.error': '添加媒体库失败：{error}',

  'mediaLibrary.remove.selectTitle': '选择要移除的媒体库',
  'mediaLibrary.remove.success': '媒体库已移除',

  'mediaLibrary.override.selectTitle': '选择要设置本地覆盖的媒体库',
  'mediaLibrary.override.dialogTitle': '选择 ${variable} 的本地路径',
  'mediaLibrary.override.success': '已为 ${variable} 设置本地覆盖',

  'mediaLibrary.import.success': '已导入：{name}',
  'mediaLibrary.import.successMultiple': '已导入 {count} 个文件',

  'mediaLibrary.copyPath.success': '文件路径已复制到剪贴板',

  'mediaLibrary.placeholder': '未配置媒体库',
  'mediaLibrary.placeholder.action': '添加媒体库',

  'mediaLibrary.status.online': '状态：在线',
  'mediaLibrary.status.offline': '状态：离线',

  'mediaLibrary.fileCount': '{count} 个文件',
  'mediaLibrary.fileCount.plural': '{count} 个文件',

  // Search
  'mediaLibrary.search.placeholder': '在所有媒体库中搜索文件...',
  'mediaLibrary.search.noResults': '未找到匹配的文件',
  'mediaLibrary.search.scanning': '正在扫描媒体库...',

  // Commands
  'command.previewVideo': '预览视频',
  'command.previewAudio': '预览音频',
  'command.openFile': '打开文件',

  // Metadata tooltips
  'metadata.resolution': '分辨率',
  'metadata.duration': '时长',
  'metadata.frameRate': '帧率',
  'metadata.codec': '编码',
  'metadata.size': '大小',
  'metadata.sampleRate': '采样率',
  'metadata.channels': '声道',
  'metadata.bitrate': '比特率',

  // Asset Manager entity / variant CRUD
  'entity.rename.prompt': '输入新名称',
  'entity.delete.confirm': '删除"{name}"？此操作无法撤销。',
  'entity.delete.action': '删除',
  'entity.addVariant.prompt': '输入变体名称',
  'entity.addVariant.placeholder': '例如：4K、草稿、v2',
  'variant.rename.prompt': '输入新变体名称',
  'variant.delete.confirm': '删除变体"{name}"？此操作无法撤销。',
  'variant.delete.action': '删除',
  'variant.addFile.title': '选择要添加到变体的文件',
};
