/**
 * Media Processing Protocol - Media Engine Types
 *
 * Download-related types for the compatible mode engine (Native FFmpeg + wgpu).
 */

// =============================================================================
// Download State
// =============================================================================

/**
 * Download state for compatible mode
 */
export type DownloadStateType =
  'idle' | 'downloading' | 'extracting' | 'verifying' | 'completed' | 'error';

// =============================================================================
// Download Protocol Messages
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
 * Get download status request
 */
export interface GetDownloadStatusRequest extends BaseMediaRequest {
  type: 'mediaEngine:getDownloadStatus';
}

/**
 * Get download status response
 */
export interface GetDownloadStatusResponse extends BaseMediaResponse {
  type: 'mediaEngine:response:getDownloadStatus';
  payload?: {
    /** Whether compatible mode is installed */
    installed: boolean;
    /** Installed version */
    version?: string;
    /** Installed size in bytes */
    size?: number;
    /** Current download state */
    state: DownloadStateType;
    /** Download progress (0-100) */
    progress?: number;
    /** Error message if state is error */
    error?: string;
  };
}

/**
 * Start download request
 */
export interface StartDownloadRequest extends BaseMediaRequest {
  type: 'mediaEngine:startDownload';
}

/**
 * Start download response
 */
export interface StartDownloadResponse extends BaseMediaResponse {
  type: 'mediaEngine:response:startDownload';
  payload?: {
    /** Whether download started successfully */
    started: boolean;
  };
}

/**
 * Download progress notification (Extension → Webview push)
 */
export interface DownloadProgressNotification {
  type: 'mediaEngine:downloadProgress';
  payload: {
    /** Download progress (0-100) */
    progress: number;
    /** Current state */
    state: DownloadStateType;
    /** Downloaded bytes */
    downloadedBytes?: number;
    /** Total bytes */
    totalBytes?: number;
  };
}

/**
 * Download complete notification (Extension → Webview push)
 */
export interface DownloadCompleteNotification {
  type: 'mediaEngine:downloadComplete';
  payload: {
    /** Whether download succeeded */
    success: boolean;
    /** Error message if failed */
    error?: string;
    /** Installed version */
    version?: string;
  };
}

/**
 * All media engine notification types (push from Extension)
 */
export type MediaEngineNotification = DownloadProgressNotification | DownloadCompleteNotification;
