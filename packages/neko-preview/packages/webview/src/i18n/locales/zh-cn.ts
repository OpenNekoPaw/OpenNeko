/**
 * Chinese (Simplified) translations for neko-preview webview
 */
import type { MessageBundle } from '@neko/shared';

const preview: MessageBundle = {
  // Host adapter
  'preview.hostAdapter.tools': '预览工具',
  'preview.hostAdapter.dock': '{label} 宿主适配器',
  'preview.hostAdapter.package': '包',
  'preview.hostAdapter.panel': '面板',
  'preview.hostAdapter.runtime': '运行时',
  'preview.hostAdapter.file': '文件',
  // Video player
  'preview.video.loading': '正在加载视频...',
  'preview.video.error': '错误：{error}',
  'preview.video.noMediaInfo': '无媒体信息',
  'preview.video.pipActive': '正在画中画播放',
  'preview.video.pauseButton': '暂停 (空格)',
  'preview.video.playButton': '播放 (空格)',
  'preview.video.mute': '静音',
  'preview.video.unmute': '取消静音',
  'preview.video.volumeLabel': '音量：{percent}%',
  'preview.video.speedLabel': '播放速度',
  'preview.video.showStats': '显示统计 (D)',
  'preview.video.hideStats': '隐藏统计 (D)',
  'preview.video.pipButton': '画中画',
  'preview.video.exitPip': '退出画中画',
  'preview.video.disconnected': '已断开',
  // Audio player
  'preview.audio.loading': '正在加载音频...',
  'preview.audio.error': '错误：{error}',
  'preview.audio.noMediaInfo': '无媒体信息',
  'preview.audio.defaultFilename': '音频文件',
  'preview.audio.unknownCodec': '未知',
  'preview.audio.mono': '单声道',
  'preview.audio.stereo': '立体声',
  'preview.audio.pauseButton': '暂停 (空格)',
  'preview.audio.playButton': '播放 (空格)',
  'preview.audio.mute': '静音',
  'preview.audio.unmute': '取消静音',
  'preview.audio.volumeLabel': '音量：{percent}%',
  'preview.audio.skipBack': '后退 10 秒',
  'preview.audio.skipForward': '前进 10 秒',
  'preview.audio.speedLabel': '播放速度',
  'preview.audio.noLyrics': '暂无歌词',
  'preview.audio.viewCover': '封面',
  'preview.audio.viewLyrics': '歌词',
  'preview.audio.viewWaveform': '波形',
  'preview.audio.viewSpectrum': '频谱',
  // Document shared
  'preview.document.sendContentToAgent': '发送内容到 Agent',
  'preview.document.sendFileToAgent': '发送文件到 Agent',
  'preview.document.loading': '加载中...',
  'preview.document.error': '错误：{error}',
  'preview.document.pageOf': '第 {current} 页 / 共 {total} 页',
  'preview.document.zoomIn': '放大',
  'preview.document.zoomOut': '缩小',
  'preview.document.fitWidth': '适应宽度',
  'preview.document.fitPage': '适应页面',
  // PDF
  'preview.pdf.loading': '正在加载 PDF...',
  // CBZ
  'preview.cbz.loading': '正在加载漫画...',
  'preview.cbz.pageAlt': '第 {number} 页',
  // Document mode toggle (PDF / CBZ)
  'preview.document.modeScroll': '切换为滚动模式',
  'preview.document.modePage': '切换为分页模式',
  // EPUB
  'preview.epub.loading': '正在加载书籍...',
  'preview.epub.toc': '目录',
  'preview.epub.theme': '阅读主题',
  'preview.epub.fontSize': '字号',
  'preview.epub.modePaginated': '切换为分页模式',
  'preview.epub.modeWaterfall': '切换为瀑布流模式',
  // DOCX
  'preview.docx.loading': '正在加载文档...',
};

export const bundles: Record<string, MessageBundle> = {
  preview,
};
