/**
 * Media Processing Protocol - Base Types
 *
 * 定义 Webview 和 Extension 之间的媒体处理 IPC 协议
 *
 * Phase 4 更新：
 * - 新增 ExtensionCacheStats 类型
 * - 简化合成请求（保留为单轨解码 IPC）
 * - Extension 端仅负责单轨解码，合成移至 Webview GPU
 *
 * 职责：
 * - 定义媒体请求/响应消息类型
 * - 定义媒体信息结构
 * - 保证类型安全的 IPC 通信
 */

// =============================================================================
// Media Request Types
// =============================================================================

/**
 * 媒体请求基础类型
 */
interface BaseMediaRequest {
  /** 请求 ID，用于匹配响应 */
  requestId: string;
  /** 请求时间戳 */
  timestamp: number;
}

/**
 * 视频帧提取请求
 */
export interface GetVideoFrameRequest extends BaseMediaRequest {
  type: 'media:getVideoFrame';
  payload: {
    /** 视频文件路径（相对或绝对路径） */
    videoPath: string;
    /** 时间点（秒） */
    timeInSeconds: number;
    /** Phase 2: 质量参数（可选） */
    quality?: number;
    /** Phase 2: 缩放比例（可选，0-1） */
    scale?: number;
  };
}

/**
 * 批量视频帧提取请求（用于预加载）
 * 使用流式提取，比逐帧请求更高效
 */
export interface GetVideoFrameRangeRequest extends BaseMediaRequest {
  type: 'media:getVideoFrameRange';
  payload: {
    /** 视频文件路径 */
    videoPath: string;
    /** 开始时间（秒） */
    startTime: number;
    /** 持续时间（秒） */
    duration: number;
    /** 帧率 */
    fps: number;
    /** Phase 2: 质量参数（可选） */
    quality?: number;
    /** Phase 2: 缩放比例（可选，0-1） */
    scale?: number;
    /** 最大帧数限制（可选，防止 Webview 内存溢出） */
    maxFrames?: number;
  };
}

/**
 * 音频段解码请求
 */
export interface DecodeAudioSegmentRequest extends BaseMediaRequest {
  type: 'media:decodeAudioSegment';
  payload: {
    /** 视频文件路径 */
    videoPath: string;
    /** 开始时间（秒） */
    startTime: number;
    /** 持续时间（秒） */
    duration: number;
    /** 采样率（可选，默认 48000） */
    sampleRate?: number;
    /** 声道数（可选，默认 2） */
    channels?: number;
  };
}

/**
 * 媒体信息探测请求
 */
export interface ProbeMediaInfoRequest extends BaseMediaRequest {
  type: 'media:probeMediaInfo';
  payload: {
    /** 视频文件路径 */
    videoPath: string;
  };
}

/**
 * 字幕流信息
 */
export interface SubtitleStream {
  /** 流索引 */
  index: number;
  /** 编码格式 (subrip, ass, webvtt, etc.) */
  codec: string;
  /** 语言代码 (eng, chi, etc.) */
  language?: string;
  /** 标题 */
  title?: string;
  /** 是否默认 */
  isDefault?: boolean;
  /** 是否强制 */
  isForced?: boolean;
}

/**
 * 字幕提取请求 - 自动提取全部字幕流
 */
export interface ExtractSubtitlesRequest extends BaseMediaRequest {
  type: 'media:extractSubtitles';
  payload: {
    /** 视频文件路径 */
    videoPath: string;
  };
}

/**
 * 波形数据请求 - 通过 neko-engine 生成音频波形
 * 使用 Rust/FFmpeg 端解码，不受 CSP 限制
 */
export interface GetWaveformRequest extends BaseMediaRequest {
  type: 'media:getWaveform';
  payload: {
    /** 音频/视频文件路径（相对或绝对路径） */
    filePath: string;
  };
}

/**
 * 所有媒体请求类型的联合
 */
export type MediaRequest =
  | GetVideoFrameRequest
  | GetVideoFrameRangeRequest
  | DecodeAudioSegmentRequest
  | ProbeMediaInfoRequest
  | ExtractSubtitlesRequest
  | GetWaveformRequest;

// =============================================================================
// Media Response Types
// =============================================================================

/**
 * 媒体响应基础类型
 */
interface BaseMediaResponse {
  /** 对应的请求 ID */
  requestId: string;
  /** 响应类型 */
  type: string;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 视频帧提取响应
 */
export interface GetVideoFrameResponse extends BaseMediaResponse {
  type: 'media:response:getVideoFrame';
  payload?: {
    /** Base64 编码的图片数据 URL（旧格式，兼容性） */
    imageDataUrl?: string;
    /** 原始图片数据（新格式，更高效） */
    imageBuffer?: ArrayBuffer;
    /** 图片 MIME 类型（新格式） */
    mimeType?: string;
  };
}

/**
 * 批量视频帧提取响应
 */
export interface GetVideoFrameRangeResponse extends BaseMediaResponse {
  type: 'media:response:getVideoFrameRange';
  payload?: {
    /** 帧数据数组 */
    frames: Array<{
      /** 帧时间（秒） */
      time: number;
      /** 帧图片数据 (ArrayBuffer, 可能在 postMessage 序列化时丢失) */
      imageBuffer?: ArrayBuffer;
      /** 帧图片 base64 Data URL (推荐格式，可靠传输) */
      imageDataUrl?: string;
    }>;
    /** 图片 MIME 类型 */
    mimeType?: string;
  };
}

/**
 * 音频段解码响应
 */
export interface DecodeAudioSegmentResponse extends BaseMediaResponse {
  type: 'media:response:decodeAudioSegment';
  payload?: {
    /** 原始 PCM 音频数据（ArrayBuffer） */
    buffer: ArrayBuffer;
    /** 采样率 */
    sampleRate: number;
    /** 声道数 */
    channels: number;
    /** 实际持续时间 */
    duration: number;
  };
}

/**
 * 媒体信息探测响应
 */
export interface ProbeMediaInfoResponse extends BaseMediaResponse {
  type: 'media:response:probeMediaInfo';
  payload?: MediaInfo;
}

/**
 * 提取的字幕轨道数据
 */
export interface ExtractedSubtitleTrack {
  /** 流索引 */
  streamIndex: number;
  /** 语言代码 */
  language?: string;
  /** 标题 */
  title?: string;
  /** 是否默认 */
  isDefault: boolean;
  /** 字幕条目列表 */
  cues: SubtitleCueData[];
}

/**
 * 字幕条目数据（用于 IPC 传输）
 */
export interface SubtitleCueData {
  /** 唯一标识 */
  id: string;
  /** 开始时间（秒） */
  startTime: number;
  /** 结束时间（秒） */
  endTime: number;
  /** 字幕文本 */
  text: string;
}

/**
 * 字幕提取响应 - 返回所有字幕轨道
 */
export interface ExtractSubtitlesResponse extends BaseMediaResponse {
  type: 'media:response:extractSubtitles';
  payload?: {
    tracks: ExtractedSubtitleTrack[];
  };
}

/**
 * 波形数据响应 - 从 neko-engine 返回的波形峰值数据
 */
export interface GetWaveformResponse extends BaseMediaResponse {
  type: 'media:response:getWaveform';
  payload?: {
    /** 采样率 (Hz) */
    sampleRate: number;
    /** 声道数 */
    channels: number;
    /** 每秒峰值数（分辨率） */
    peaksPerSecond: number;
    /** 时长（秒） */
    duration: number;
    /** 多声道峰值数组 peaks[channel][sampleIndex]，值范围 0-1 */
    peaks: number[][];
  };
}

/**
 * 所有媒体响应类型的联合
 */
export type MediaResponse =
  | GetVideoFrameResponse
  | GetVideoFrameRangeResponse
  | DecodeAudioSegmentResponse
  | ProbeMediaInfoResponse
  | ExtractSubtitlesResponse
  | GetWaveformResponse;

// =============================================================================
// Media Info Types
// =============================================================================

/**
 * 媒体文件信息
 */
export interface MediaInfo {
  /** 视频时长（秒） */
  duration: number;
  /** 视频宽度 */
  width: number;
  /** 视频高度 */
  height: number;
  /** 帧率 */
  fps: number;
  /** 视频编码格式 */
  codec: string;
  /** 容器格式 */
  format: string;
  /** 视频码率（bps） */
  bitrate?: number;
  /** 是否包含音频流 */
  hasAudio: boolean;
  /** 音频编码格式（如果有） */
  audioCodec?: string;
  /** 音频采样率（如果有） */
  audioSampleRate?: number;
  /** 音频声道数（如果有） */
  audioChannels?: number;
  /** 音频码率（bps，如果有） */
  audioBitrate?: number;
  /** 是否包含字幕流 */
  hasSubtitles: boolean;
  /** 字幕流信息列表 */
  subtitleStreams?: SubtitleStream[];
}
