/**
 * Chinese translations for neko-assets
 */

import type { AssetTranslations } from './en';

export const zhCn: AssetTranslations = {
  // Media Library Management
  'mediaLibrary.add.title': '选择媒体库目录',
  'mediaLibrary.add.namePrompt': '输入媒体库名称',
  'mediaLibrary.add.namePlaceholder': '例如：团队素材',
  'mediaLibrary.add.success': '媒体库 "{name}" 已添加',
  'mediaLibrary.add.error': '添加媒体库失败：{error}',

  'mediaLibrary.remove.selectTitle': '选择要移除的媒体库',
  'mediaLibrary.remove.success': '媒体库已移除',

  'mediaLibrary.delete.action': '删除文件',
  'mediaLibrary.delete.confirm':
    '确定从链接的媒体库目标中删除“{fileName}”吗？此操作会删除目标文件，而不只是移除工作区链接。',
  'mediaLibrary.delete.failed': '媒体库删除失败（{code}）。',
  'mediaLibrary.delete.invalidSelection': '请选择要删除的媒体库文件。',
  'mediaLibrary.delete.success': '媒体库文件已删除。',

  'mediaLibrary.relink.selectTitle': '选择要重新链接的媒体库',
  'mediaLibrary.relink.dialogTitle': '选择“{name}”的替代目录',
  'mediaLibrary.relink.success': '媒体库“{name}”已重新链接',
  'mediaLibrary.relink.structureWarning':
    '重新链接“{name}”不会改写已保存的 neko/assets/{name}/... 路径。请选择内部目录结构相同的替代目录。',
  'mediaLibrary.relink.confirmAction': '选择替代目录',

  'mediaLibrary.gitIntegration.warning':
    'VS Code 内置 Git 无法检查链接媒体库目录下的文件，可能反复报告 pathspec 错误。是否在存在链接媒体库期间关闭此工作区文件夹的内置 Git？该文件夹的 Git 功能将不可用，文件和 Neko 媒体访问不受影响。',
  'mediaLibrary.gitIntegration.disableAction': '对此文件夹关闭 Git',
  'mediaLibrary.gitIntegration.keepAction': '保持 Git 启用',
  'mediaLibrary.gitIntegration.disabled': '存在链接媒体库期间，已关闭此工作区文件夹的内置 Git。',

  'mediaLibrary.import.success': '已导入：{name}',
  'mediaLibrary.import.successMultiple': '已导入 {count} 个文件',

  'mediaLibrary.copyPath.success': '文件路径已复制到剪贴板',
  'mediaLibrary.copy.destinationOutsideLibrary': '请选择所选媒体库内部的目标位置。',
  'mediaLibrary.copy.failed': '复制到媒体库失败（{code}）。',
  'mediaLibrary.copy.invalidSource': '请选择支持复制的内容来源。',
  'mediaLibrary.copy.selectDestination': '选择媒体库目标位置',
  'mediaLibrary.copy.selectLibrary': '选择可写媒体库',
  'mediaLibrary.copy.success': '文件已复制到媒体库。',

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
};
