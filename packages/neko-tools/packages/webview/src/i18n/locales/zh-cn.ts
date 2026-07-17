/**
 * Chinese (Simplified) translations for neko-tools webview
 */
import type { MessageBundle } from '@neko/shared';

const mediaDiff: MessageBundle = {
  'mediaDiff.cancel': '取消',
  'mediaDiff.retry': '重试',
  'mediaDiff.identical': '完全相同',
  'mediaDiff.similarity': '相似度：',
  'mediaDiff.compareWith': '比较对象：',
  'mediaDiff.cancelAnalysis': '取消分析',
  'mediaDiff.analyzing': '分析中...',
  'mediaDiff.apply': '应用',
  'mediaDiff.reset': '重置',
  'mediaDiff.range': '范围：',
  'mediaDiff.startTimeHint': '开始时间（如 0:05.0 或 5）',
  'mediaDiff.endTimeHint': '结束时间（如 1:30.0 或 90）',
  'mediaDiff.applyRange': '使用选定时间范围重新分析',
  'mediaDiff.resetRange': '重置为完整时长',
  'mediaDiff.zoom': '缩放',
  'mediaDiff.opacity': '透明度',
  // View modes
  'mediaDiff.viewMode.sideBySide': '并排对比',
  'mediaDiff.viewMode.slider': '滑块',
  'mediaDiff.viewMode.overlay': '叠加',
  'mediaDiff.viewMode.onionSkin': '洋葱皮',
  // Video frame labels
  'mediaDiff.previous': '上一版',
  'mediaDiff.current': '当前版',
  'mediaDiff.differenceHeatmap': '差异热力图',
  'mediaDiff.webglNotAvailable': 'WebGL 不可用 — 使用回退视图',
  // Video diff
  'mediaDiff.video.fetchingPrevious': '正在获取上一版本…',
  'mediaDiff.video.seek': '定位',
  'mediaDiff.video.analyzing': '正在分析视频...',
  'mediaDiff.video.playTitle': '播放视频差异',
  'mediaDiff.video.streamError': '流错误：{error}',
  'mediaDiff.video.startingStreams': '正在启动视频流...',
  'mediaDiff.video.duration': '时长',
  'mediaDiff.video.resolution': '分辨率',
  'mediaDiff.video.frameRate': '帧率',
  'mediaDiff.video.codec': '编码格式',
  'mediaDiff.video.keyframeSimilarities': '关键帧相似度',
  // Audio diff
  'mediaDiff.audio.previous': '上一版',
  'mediaDiff.audio.current': '当前版',
  'mediaDiff.audio.playPrevious': '上一版',
  'mediaDiff.audio.playBoth': '双轨',
  'mediaDiff.audio.playCurrent': '当前版',
  'mediaDiff.audio.fetchingPrevious': '正在获取上一版本…',
  'mediaDiff.audio.seek': '定位',
  'mediaDiff.audio.loading': '正在加载音频文件...',
  'mediaDiff.audio.zoom': '缩放：{level}x',
  'mediaDiff.audio.wheelHint': 'Ctrl+滚轮: 缩放 · 滚轮: 滚动',
  'mediaDiff.audio.duration': '时长',
  'mediaDiff.audio.sampleRate': '采样率',
  'mediaDiff.audio.channels': '声道',
  'mediaDiff.audio.mono': '单声道',
  'mediaDiff.audio.stereo': '立体声',
  'mediaDiff.audio.bitrate': '比特率',
  'mediaDiff.audio.silentRegions': '检测到静音区域',
  'mediaDiff.audio.trackPrevious': 'A（上一版）',
  'mediaDiff.audio.trackCurrent': 'B（当前版）',
  'mediaDiff.audio.trackDiff': '差异 |A-B|',
  // Git
  'mediaDiff.loadGitHistory': '加载 Git 历史',
  'mediaDiff.flicker': '闪烁：{version}',
};

const assetDiff: MessageBundle = {
  'assetDiff.title': '素材变体对比',
  'assetDiff.loading': '加载中...',
  'assetDiff.analyzing': '分析中...',
  'assetDiff.retry': '重试',
  'assetDiff.similar': '相似',
  'assetDiff.attributes': '属性',
  'assetDiff.noChanges': '无变化',
  'assetDiff.viewMode.sideBySide': '并排',
  'assetDiff.viewMode.slider': '滑块',
  'assetDiff.viewMode.overlay': '叠加',
  'assetDiff.tabs.media': '媒体',
  'assetDiff.tabs.attributes': '属性',
  'assetDiff.tabs.ai': 'AI 分析',
  'assetDiff.aiAnalysis': 'AI 分析',
  'assetDiff.requestAI': '生成 AI 摘要',
  'assetDiff.noFile': '无预览文件',
};

export const bundles: Record<string, MessageBundle> = {
  assetDiff,
  mediaDiff,
};
