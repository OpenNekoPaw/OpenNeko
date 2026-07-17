/**
 * Export Protocol
 *
 * 定义 Webview 和 Extension 之间的导出 IPC 协议
 *
 * 职责：
 * - 定义导出请求/响应消息类型
 * - 定义导出配置和状态结构
 * - 保证类型安全的 IPC 通信
 */

import type { ProjectData } from './project';

// =============================================================================
// Export Settings
// =============================================================================

/**
 * 导出格式
 */
export type ExportFormat = 'mp4' | 'webm';

/**
 * 导出质量预设
 */
export type ExportQuality = 'low' | 'medium' | 'high' | 'custom';

/**
 * 视频编码器
 */
export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'av1';

/**
 * 音频编码器
 */
export type AudioCodec = 'aac' | 'opus' | 'mp3';

/**
 * 导出设置
 */
export interface ExportSettings {
  /** 输出宽度 */
  width: number;
  /** 输出高度 */
  height: number;
  /** 帧率 */
  fps: number;
  /** 输出格式 */
  format: ExportFormat;
  /** 质量预设 */
  quality: ExportQuality;
  /** 视频编码器（可选，自动选择） */
  videoCodec?: VideoCodec;
  /** 视频比特率（kbps，可选） */
  videoBitrate?: number;
  /** 音频编码器（可选，自动选择） */
  audioCodec?: AudioCodec;
  /** 音频比特率（kbps，可选） */
  audioBitrate?: number;
  /** 是否启用硬件加速 */
  hardwareAccel?: boolean;
  /** 时间范围（可选，默认导出整个项目） */
  timeRange?: {
    start: number;
    end: number;
  };
}

/**
 * 默认导出设置
 */
export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  width: 960, // EMERGENCY FIX: Further reduce to 960 for complex projects
  height: 540, // EMERGENCY FIX: Further reduce to 540 for complex projects
  fps: 30,
  format: 'mp4',
  quality: 'high',
  hardwareAccel: false, // CRITICAL FIX: Disable HW accel to avoid VideoToolbox encoding bottleneck
  // CRITICAL FIX: Add default video bitrate based on resolution
  // For 960x540@30fps: ~2500 kbps is reasonable for high quality
  videoBitrate: 2500,
  audioBitrate: 192,
};

// =============================================================================
// Export Job Types
// =============================================================================

/**
 * 导出任务配置
 */
export interface ExportJobConfig {
  /** 项目数据 */
  project: ProjectData;
  /** 输出文件路径 */
  outputPath: string;
  /** 导出设置 */
  settings: ExportSettings;
  /** 项目根目录路径（用于解析相对路径） */
  projectRoot?: string;
}

/**
 * 导出任务状态
 */
export type ExportJobState =
  | 'pending'
  | 'initializing'
  | 'rendering'
  | 'encoding'
  | 'muxing'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'error';

/**
 * 导出任务状态信息
 */
export interface ExportJobStatus {
  /** 任务 ID */
  jobId: string;
  /** 当前状态 */
  state: ExportJobState;
  /** 进度（0-100） */
  progress: number;
  /** 当前帧（如果在渲染阶段） */
  currentFrame?: number;
  /** 总帧数 */
  totalFrames?: number;
  /** 已用时间（毫秒） */
  elapsedTime?: number;
  /** 预估剩余时间（毫秒） */
  estimatedRemaining?: number;
  /** 当前阶段描述 */
  stageDescription?: string;
  /** 错误信息（如果状态为 error） */
  error?: string;
  /** 不支持的特效列表 */
  unsupportedFeatures?: string[];
}

// =============================================================================
// Export Request Types
// =============================================================================

/**
 * 导出请求基础类型
 */
export interface BaseExportRequest {
  /** 请求 ID */
  requestId: string;
  /** 请求时间戳 */
  timestamp: number;
}

/**
 * 开始导出请求
 */
export interface ExportStartRequest extends BaseExportRequest {
  type: 'export:start';
  payload: {
    /** 项目数据 */
    project: ProjectData;
    /** 输出路径 */
    outputPath: string;
    /** 导出设置 */
    settings: ExportSettings;
  };
}

/**
 * 取消导出请求
 */
export interface ExportCancelRequest extends BaseExportRequest {
  type: 'export:cancel';
  payload: {
    /** 任务 ID */
    jobId: string;
  };
}

/**
 * 查询导出状态请求
 */
export interface ExportStatusRequest extends BaseExportRequest {
  type: 'export:status';
  payload: {
    /** 任务 ID */
    jobId: string;
  };
}

/**
 * 所有导出请求类型的联合
 */
export type ExportRequest = ExportStartRequest | ExportCancelRequest | ExportStatusRequest;

// =============================================================================
// Export Response Types
// =============================================================================

/**
 * 导出响应基础类型
 */
export interface BaseExportResponse {
  /** 对应的请求 ID */
  requestId?: string;
  /** 响应类型 */
  type: string;
}

/**
 * 导出开始响应
 */
export interface ExportStartResponse extends BaseExportResponse {
  type: 'export:started';
  /** 任务 ID */
  jobId: string;
  /** 错误信息（如果启动失败） */
  error?: string;
}

/**
 * 导出进度响应（推送消息）
 */
export interface ExportProgressResponse extends BaseExportResponse {
  type: 'export:progress';
  /** 任务 ID */
  jobId: string;
  /** 进度（0-100） */
  progress: number;
  /** 当前帧 */
  currentFrame: number;
  /** 总帧数 */
  totalFrames: number;
  /** 已用时间（毫秒） */
  elapsedTime: number;
  /** 预估剩余时间（毫秒） */
  estimatedRemaining: number;
  /** 当前阶段 */
  stage: ExportJobState;
  /** 阶段描述 */
  stageDescription?: string;
}

/**
 * 导出完成响应
 */
export interface ExportCompleteResponse extends BaseExportResponse {
  type: 'export:complete';
  /** 任务 ID */
  jobId: string;
  /** 输出文件路径 */
  outputPath: string;
  /** 文件大小（字节） */
  fileSize: number;
  /** 总耗时（毫秒） */
  totalTime: number;
}

/**
 * 导出取消响应
 */
export interface ExportCancelledResponse extends BaseExportResponse {
  type: 'export:cancelled';
  /** 任务 ID */
  jobId: string;
}

/**
 * 导出错误响应
 */
export interface ExportErrorResponse extends BaseExportResponse {
  type: 'export:error';
  /** 任务 ID */
  jobId: string;
  /** 错误信息 */
  error: string;
  /** 不支持的特效列表（如果是能力检测失败） */
  unsupportedFeatures?: string[];
}

/**
 * 导出状态响应
 */
export interface ExportStatusResponse extends BaseExportResponse {
  type: 'export:status';
  /** 任务状态（null 表示任务不存在） */
  status: ExportJobStatus | null;
}

/**
 * 所有导出响应类型的联合
 */
export type ExportResponse =
  | ExportStartResponse
  | ExportProgressResponse
  | ExportCompleteResponse
  | ExportCancelledResponse
  | ExportErrorResponse
  | ExportStatusResponse;

// =============================================================================
// Protocol Constants
// =============================================================================

/**
 * 导出协议版本
 */
export const EXPORT_PROTOCOL_VERSION = '1.0.0';

/**
 * 导出请求超时时间（毫秒）
 * 注意：这是启动导出的超时，不是导出完成的超时
 */
export const EXPORT_START_TIMEOUT = 30000; // 30 seconds

/**
 * 最大并发导出任务数
 */
export const MAX_CONCURRENT_EXPORTS = 1;

// =============================================================================
// Capability Detection
// =============================================================================

/**
 * 导出能力检测结果
 */
export interface ExportCapabilityResult {
  /** 是否完全支持 */
  fullySupported: boolean;
  /** 不支持的特效列表 */
  unsupportedFeatures: ExportUnsupportedFeature[];
  /** 建议的回退策略 */
  fallbackSuggestion?: 'webcodecs' | 'simplify' | 'error';
}

/**
 * 不支持的特效信息
 */
export interface ExportUnsupportedFeature {
  /** 元素 ID */
  elementId: string;
  /** 特效类型 */
  featureType: string;
  /** 特效名称 */
  featureName: string;
  /** 原因 */
  reason: string;
  /** 是否可降级处理 */
  canDegrade: boolean;
}

/**
 * FFmpeg 支持的特效映射
 */
export const FFMPEG_SUPPORTED_FEATURES = {
  /** 变换 */
  transforms: ['position', 'scale', 'rotation'],
  /** 混合模式（仅支持部分） */
  blendModes: ['normal', 'multiply', 'screen', 'overlay'],
  /** 颜色校正 */
  colorCorrection: ['brightness', 'contrast', 'saturation'],
  /** 转场（使用 xfade） */
  transitions: ['fade', 'dissolve', 'wipe', 'slide'],
  /** 不支持的特效 */
  unsupported: ['custom-shader', 'motion-blur', 'complex-mask', 'advanced-blend-modes'],
} as const;

// =============================================================================
// Phase 5: Streaming Export Protocol
// =============================================================================

/**
 * 流式导出模式
 *
 * Phase 5: 支持 Webview GPU 渲染 → Extension FFmpeg 流式编码
 */
export type StreamingExportMode = 'streaming'; // Webview 渲染 → 流式传输 → Extension 编码

/**
 * 帧数据格式
 */
export type FrameDataFormat =
  | 'rgba' // Raw RGBA pixels (width * height * 4 bytes)
  | 'jpeg' // JPEG compressed
  | 'png'; // PNG compressed (with alpha)

/**
 * 流式导出配置（扩展 ExportSettings）
 */
export interface StreamingExportSettings extends ExportSettings {
  /** 导出模式 */
  mode: StreamingExportMode;
  /** 帧数据格式 */
  frameFormat: FrameDataFormat;
  /** 最大待处理帧数（背压控制） */
  maxPendingFrames: number;
}

/**
 * 默认流式导出配置
 */
export const DEFAULT_STREAMING_EXPORT_SETTINGS: StreamingExportSettings = {
  ...DEFAULT_EXPORT_SETTINGS,
  mode: 'streaming',
  frameFormat: 'jpeg', // CRITICAL FIX: Use JPEG for 50x faster transfer (was 'rgba')
  maxPendingFrames: 100, // CRITICAL FIX: Increase from 30 to 100 for better throughput
};

// =============================================================================
// Streaming Export Request Types
// =============================================================================

/**
 * 初始化流式导出请求（Webview → Extension）
 *
 * 启动 FFmpeg 编码器进程，准备接收帧数据
 */
export interface StreamingExportInitRequest extends BaseExportRequest {
  type: 'export:streaming:init';
  payload: {
    /** 输出路径 */
    outputPath: string;
    /** 流式导出设置 */
    settings: StreamingExportSettings;
    /** 总帧数 */
    totalFrames: number;
    /** 音频轨道信息（用于最终 muxing） */
    audioTracks?: StreamingAudioTrack[];
    /** Phase 6: 视频源信息（用于流式解码优化） */
    videoSources?: VideoSourceInfo[];
  };
}

/**
 * 音频轨道信息
 */
export interface StreamingAudioTrack {
  /** 轨道 ID */
  trackId: string;
  /** 音频文件路径 */
  filePath: string;
  /** 在时间线中的起始时间（秒） */
  startTime: number;
  /** 时长（秒） */
  duration: number;
  /** 音量 (0-1) */
  volume: number;
}

/**
 * 推送帧请求（Webview → Extension）
 *
 * 将 GPU 渲染后的帧数据推送到 Extension 进行编码
 */
export interface StreamingExportPushFrameRequest extends BaseExportRequest {
  type: 'export:streaming:pushFrame';
  payload: {
    /** 任务 ID */
    jobId: string;
    /** 帧索引 */
    frameIndex: number;
    /** 帧数据（二进制数据或 base64 字符串） */
    frameData: Uint8Array | string;
    /** 数据格式 */
    format: FrameDataFormat;
    /** 帧宽度（用于验证） */
    width: number;
    /** 帧高度（用于验证） */
    height: number;
  };
}

/**
 * 完成流式导出请求（Webview → Extension）
 *
 * 通知 Extension 所有帧已发送，开始 finalize
 */
export interface StreamingExportFinalizeRequest extends BaseExportRequest {
  type: 'export:streaming:finalize';
  payload: {
    /** 任务 ID */
    jobId: string;
  };
}

/**
 * 扩展的导出请求联合类型
 */
export type StreamingExportRequest =
  | ExportRequest
  | StreamingExportInitRequest
  | StreamingExportPushFrameRequest
  | StreamingExportFinalizeRequest;

// =============================================================================
// Streaming Export Response Types
// =============================================================================

/**
 * 流式导出初始化响应（Extension → Webview）
 */
export interface StreamingExportInitResponse extends BaseExportResponse {
  type: 'export:streaming:initialized';
  /** 任务 ID */
  jobId: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** FFmpeg 编码器信息 */
  encoderInfo?: {
    videoCodec: string;
    audioCodec: string;
    hwAccel: string | null;
  };
}

/**
 * 帧确认响应（Extension → Webview）
 *
 * 确认帧已接收并编码，用于背压控制
 */
export interface StreamingExportFrameAckResponse extends BaseExportResponse {
  type: 'export:streaming:frameAck';
  /** 任务 ID */
  jobId: string;
  /** 已确认的帧索引 */
  frameIndex: number;
  /** 当前缓冲区中的待处理帧数 */
  pendingFrames: number;
  /** 是否需要 Webview 暂停发送（背压信号） */
  shouldPause: boolean;
}

/**
 * 恢复发送信号（Extension → Webview）
 *
 * 当缓冲区有空间时，通知 Webview 继续发送
 */
export interface StreamingExportResumeResponse extends BaseExportResponse {
  type: 'export:streaming:resume';
  /** 任务 ID */
  jobId: string;
  /** 当前待处理帧数 */
  pendingFrames: number;
}

/**
 * 扩展的导出响应联合类型
 */
export type StreamingExportResponse =
  | ExportResponse
  | StreamingExportInitResponse
  | StreamingExportFrameAckResponse
  | StreamingExportResumeResponse;

// =============================================================================
// Backpressure Control
// =============================================================================

/**
 * 背压状态
 */
export interface BackpressureStatus {
  /** 当前待处理帧数 */
  pendingFrames: number;
  /** 最大允许待处理帧数 */
  maxPendingFrames: number;
  /** 利用率 (0-1) */
  utilization: number;
  /** 是否应该暂停 */
  shouldPause: boolean;
  /** 预估编码速度（帧/秒） */
  encodingFps: number;
}

/**
 * 背压阈值配置
 */
export interface BackpressureConfig {
  /** 暂停阈值（利用率，默认 0.9） */
  pauseThreshold: number;
  /** 恢复阈值（利用率，默认 0.5） */
  resumeThreshold: number;
  /** 最大待处理帧数 */
  maxPendingFrames: number;
  /** 最大等待时间（毫秒） */
  maxWaitTime: number;
}

/**
 * 默认背压配置
 */
export const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  pauseThreshold: 0.8, // Pause at 80% utilization (was 0.95)
  resumeThreshold: 0.4, // Resume at 40% utilization (was 0.5)
  maxPendingFrames: 50, // Buffer 50 frames (was 100) - reduced since encoding tracking is now accurate
  maxWaitTime: 30000,
};

// =============================================================================
// Streaming Export Job State
// =============================================================================

/**
 * 流式导出任务扩展状态
 */
export type StreamingExportJobState = ExportJobState | 'streaming'; // 正在接收和编码帧

/**
 * 流式导出任务状态
 */
export interface StreamingExportJobStatus extends ExportJobStatus {
  /** 流式导出特有状态 */
  streaming?: {
    /** 已接收帧数 */
    receivedFrames: number;
    /** 已编码帧数 */
    encodedFrames: number;
    /** 当前缓冲区帧数 */
    bufferedFrames: number;
    /** 背压状态 */
    backpressure: BackpressureStatus;
    /** 实时编码速度（帧/秒） */
    encodingFps: number;
    /** Webview 渲染速度（帧/秒） */
    renderingFps: number;
  };
}

// =============================================================================
// Protocol Version
// =============================================================================

/**
 * 流式导出协议版本
 */
export const STREAMING_EXPORT_PROTOCOL_VERSION = '2.0.0';

// =============================================================================
// Phase 6: Streaming Video Decode Protocol
// =============================================================================

/**
 * 流式视频解码器状态
 */
export type StreamingDecoderState =
  | 'idle' // 空闲
  | 'starting' // 正在启动
  | 'decoding' // 解码中
  | 'paused' // 已暂停
  | 'completed' // 已完成
  | 'error'; // 错误

/**
 * 视频源信息（用于初始化解码器）
 */
export interface VideoSourceInfo {
  /** 视频文件路径 */
  videoPath: string;
  /** 在时间线中的起始时间 */
  startTime: number;
  /** 时长 */
  duration: number;
  /** 裁剪起始时间 (trimStart) */
  trimStart: number;
  /** 帧率 */
  fps: number;
  /** 元素 ID（用于关联） */
  elementId: string;
}

/**
 * 初始化流式解码请求
 */
export interface StreamingDecodeInitRequest {
  type: 'decode:streaming:init';
  requestId: string;
  payload: {
    /** 所有需要解码的视频源 */
    videoSources: VideoSourceInfo[];
    /** 导出帧率 */
    exportFps: number;
    /** 输出宽度（可选，用于缩放） */
    width?: number;
    /** 输出高度（可选，用于缩放） */
    height?: number;
    /** JPEG 质量 (2-31, 越小越好) */
    quality?: number;
  };
}

/**
 * 获取解码帧请求
 */
export interface StreamingDecodeGetFrameRequest {
  type: 'decode:streaming:getFrame';
  requestId: string;
  payload: {
    /** 视频路径 */
    videoPath: string;
    /** 请求的时间点（视频内部时间，即 trimStart + localTime） */
    time: number;
    /** 容差（秒），用于模糊匹配 */
    tolerance?: number;
  };
}

/**
 * 停止流式解码请求
 */
export interface StreamingDecodeStopRequest {
  type: 'decode:streaming:stop';
  requestId: string;
  payload: {
    /** 视频路径（可选，不指定则停止所有） */
    videoPath?: string;
  };
}

/**
 * 流式解码请求联合类型
 */
export type StreamingDecodeRequest =
  | StreamingDecodeInitRequest
  | StreamingDecodeGetFrameRequest
  | StreamingDecodeStopRequest;

/**
 * 流式解码初始化响应
 */
export interface StreamingDecodeInitResponse {
  type: 'decode:streaming:initialized';
  requestId: string;
  success: boolean;
  error?: string;
  /** 每个视频源的解码器状态 */
  decoders?: Array<{
    videoPath: string;
    state: StreamingDecoderState;
    totalFrames: number;
  }>;
}

/**
 * 流式解码帧响应
 */
export interface StreamingDecodeFrameResponse {
  type: 'decode:streaming:frame';
  requestId: string;
  success: boolean;
  error?: string;
  payload?: {
    /** 视频路径 */
    videoPath: string;
    /** 实际帧时间 */
    time: number;
    /** 帧数据（JPEG） */
    frameData: ArrayBuffer;
    /** MIME 类型 */
    mimeType: 'image/jpeg';
    /** 帧宽度 */
    width: number;
    /** 帧高度 */
    height: number;
  };
}

/**
 * 流式解码停止响应
 */
export interface StreamingDecodeStopResponse {
  type: 'decode:streaming:stopped';
  requestId: string;
  success: boolean;
}

/**
 * 流式解码响应联合类型
 */
export type StreamingDecodeResponse =
  | StreamingDecodeInitResponse
  | StreamingDecodeFrameResponse
  | StreamingDecodeStopResponse;

// =============================================================================
// Export Preset Types
// =============================================================================

/**
 * Settings captured in a preset — matches the fields ExportPanel uses.
 * Kept separate from ExportSettings to avoid coupling with streaming/advanced fields.
 */
export interface ExportPresetSettings {
  /** Output container format */
  format: 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi' | 'ts';
  /**
   * Video codec identifier. Intentionally `string` (not `VideoCodec`) because
   * ExportPanel supports 'prores' and other codecs beyond the VideoCodec union.
   */
  videoCodec: string;
  /**
   * Audio codec identifier. Intentionally `string` (not `AudioCodec`) because
   * ExportPanel supports 'flac', 'vorbis', 'pcm' beyond the AudioCodec union.
   */
  audioCodec: string;
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Frame rate in fps */
  fps: number;
  /** Quality preset level */
  quality: 'low' | 'medium' | 'high';
  /** Audio bitrate in bits per second (e.g. 192000 = 192 kbps) */
  audioBitrate: number;
}

/**
 * An export preset (built-in or user-defined)
 */
export interface ExportPreset {
  /** Built-in IDs: 'builtin-social' | 'builtin-web' | 'builtin-master'. User: crypto.randomUUID() */
  id: string;
  name: string;
  isBuiltin: boolean;
  settings: ExportPresetSettings;
}
