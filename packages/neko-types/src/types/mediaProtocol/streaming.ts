/**
 * Media Processing Protocol - Streaming Types
 *
 * Pull mode, frame server, and audio streaming protocol types.
 */

// =============================================================================
// Pull Mode Protocol (RAF-driven frame pulling for backpressure control)
// =============================================================================

/**
 * Webview → Extension: Signal that webview is ready to receive a frame.
 * Sent on each requestAnimationFrame cycle when a frame is needed.
 */
export interface PullModeReadyRequest {
  type: 'media:pullMode:ready';
  requestId: string;
  timestamp: number;
  payload: {
    /** Pull session ID */
    sessionId: string;
    /** Video file path */
    videoPath: string;
    /** Requested time point (seconds) */
    timeInSeconds: number;
    /** Output width (optional) */
    width?: number;
    /** Output height (optional) */
    height?: number;
  };
}

/**
 * Extension → Webview: Frame data response for pull mode.
 * Sent only after receiving a READY signal.
 */
export interface PullModeFrameResponse {
  requestId: string;
  type: 'media:pullMode:frame';
  payload?: {
    /** Pull session ID */
    sessionId: string;
    /** Frame time point (seconds) */
    timeInSeconds: number;
    /** Frame image data (binary JPEG) */
    imageData: Uint8Array;
    /** Frame width */
    width: number;
    /** Frame height */
    height: number;
  };
  error?: string;
}

/**
 * Webview → Extension: Start or stop a pull mode session.
 */
export interface PullModeControlRequest {
  type: 'media:pullMode:start' | 'media:pullMode:stop';
  requestId: string;
  timestamp: number;
  payload: {
    /** Pull session ID */
    sessionId: string;
    /** Video file path (required for 'start') */
    videoPath?: string;
  };
}

/**
 * Extension → Webview: Acknowledgment for pull mode control requests.
 */
export interface PullModeControlResponse {
  requestId: string;
  type: 'media:pullMode:started' | 'media:pullMode:stopped';
  payload: {
    /** Pull session ID */
    sessionId: string;
  };
  error?: string;
}

/**
 * Union type for all pull mode messages from Webview to Extension
 */
export type PullModeWebviewMessage = PullModeReadyRequest | PullModeControlRequest;

/**
 * Union type for all pull mode messages from Extension to Webview
 */
export type PullModeExtensionMessage = PullModeFrameResponse | PullModeControlResponse;

// =============================================================================
// Frame Server Protocol (Localhost Server Approach)
// =============================================================================

/**
 * Webview → Extension: Request to start frame server for a video
 */
export interface FrameServerStartRequest {
  type: 'media:frameServer:start';
  requestId: string;
  timestamp: number;
  payload: {
    /** Session ID for this frame server */
    sessionId: string;
    /** Video file path */
    videoPath: string;
    /** Preferred streaming mode */
    mode?: 'websocket' | 'mjpeg';
  };
}

/**
 * Extension → Webview: Frame server started response
 */
export interface FrameServerStartedResponse {
  type: 'media:frameServer:started';
  requestId: string;
  payload: {
    /** Session ID */
    sessionId: string;
    /** Server port */
    port: number;
    /** WebSocket URL */
    websocketUrl: string;
    /** MJPEG URL */
    mjpegUrl: string;
    /** Single frame URL */
    frameUrl: string;
  };
  error?: string;
}

/**
 * Webview → Extension: Request to stop frame server
 */
export interface FrameServerStopRequest {
  type: 'media:frameServer:stop';
  requestId: string;
  timestamp: number;
  payload: {
    /** Session ID */
    sessionId: string;
  };
}

/**
 * Extension → Webview: Frame server stopped response
 */
export interface FrameServerStoppedResponse {
  type: 'media:frameServer:stopped';
  requestId: string;
  payload: {
    /** Session ID */
    sessionId: string;
  };
  error?: string;
}

/**
 * Webview → Extension: Request frame at specific time (via frame server)
 * This triggers the Extension to decode and push the frame to the server
 */
export interface FrameServerPushRequest {
  type: 'media:frameServer:push';
  requestId: string;
  timestamp: number;
  payload: {
    /** Session ID */
    sessionId: string;
    /** Video file path */
    videoPath: string;
    /** Time in seconds */
    timeInSeconds: number;
  };
}

/**
 * Union type for frame server messages from Webview to Extension
 */
export type FrameServerWebviewMessage =
  | FrameServerStartRequest
  | FrameServerStopRequest
  | FrameServerPushRequest
  | FrameServerPlaybackStartRequest
  | FrameServerPlaybackStopRequest;

/**
 * Union type for frame server messages from Extension to Webview
 */
export type FrameServerExtensionMessage = FrameServerStartedResponse | FrameServerStoppedResponse;

// =============================================================================
// Frame Server Playback Control (Push Mode)
// =============================================================================

/**
 * Webview → Extension: Start continuous frame pushing for playback
 * Extension will push frames at the specified FPS without waiting for requests
 */
export interface FrameServerPlaybackStartRequest {
  type: 'media:frameServer:playback:start';
  requestId: string;
  timestamp: number;
  payload: {
    /** Video file path */
    videoPath: string;
    /** Start time in seconds */
    startTime: number;
    /** Target FPS */
    fps: number;
    /** Playback speed (1.0 = normal) */
    speed?: number;
  };
}

/**
 * Webview → Extension: Stop continuous frame pushing
 */
export interface FrameServerPlaybackStopRequest {
  type: 'media:frameServer:playback:stop';
  requestId: string;
  timestamp: number;
  payload: {
    /** Video file path */
    videoPath: string;
  };
}

// =============================================================================
// Audio Streaming Protocol (Compat Mode Real-time Audio)
// =============================================================================

/**
 * Webview → Extension: Start audio streaming for project playback
 * Extension will decode and mix audio, then stream PCM data via WebSocket
 */
export interface AudioStreamStartRequest {
  type: 'media:audioStream:start';
  requestId: string;
  timestamp: number;
  payload: {
    /** Session ID for this audio stream */
    sessionId: string;
    /** Start time in seconds */
    startTime: number;
    /** Total duration in seconds */
    duration: number;
    /** Sample rate (default 48000) */
    sampleRate?: number;
    /** Number of channels (default 2) */
    channels?: number;
  };
}

/**
 * Extension → Webview: Audio stream started response
 */
export interface AudioStreamStartedResponse {
  type: 'media:audioStream:started';
  requestId: string;
  payload: {
    /** Session ID */
    sessionId: string;
    /** WebSocket URL for audio data */
    websocketUrl: string;
    /** Sample rate */
    sampleRate: number;
    /** Number of channels */
    channels: number;
  };
  error?: string;
}

/**
 * Webview → Extension: Stop audio streaming
 */
export interface AudioStreamStopRequest {
  type: 'media:audioStream:stop';
  requestId: string;
  timestamp: number;
  payload: {
    /** Session ID */
    sessionId: string;
  };
}

/**
 * Extension → Webview: Audio stream stopped response
 */
export interface AudioStreamStoppedResponse {
  type: 'media:audioStream:stopped';
  requestId: string;
  payload: {
    /** Session ID */
    sessionId: string;
  };
  error?: string;
}

/**
 * Webview → Extension: Seek audio stream to new position
 */
export interface AudioStreamSeekRequest {
  type: 'media:audioStream:seek';
  requestId: string;
  timestamp: number;
  payload: {
    /** Session ID */
    sessionId: string;
    /** New time position in seconds */
    timeInSeconds: number;
  };
}

/**
 * Extension → Webview: Audio data chunk (pushed via postMessage for simplicity)
 * For high-performance, use WebSocket instead
 */
export interface AudioStreamDataNotification {
  type: 'media:audioStream:data';
  payload: {
    /** Session ID */
    sessionId: string;
    /** PCM audio data (Float32Array, interleaved stereo) */
    pcmData: Float32Array;
    /** Timestamp in seconds */
    timestamp: number;
    /** Sample rate */
    sampleRate: number;
    /** Number of channels */
    channels: number;
  };
}

/**
 * Union type for audio stream messages from Webview to Extension
 */
export type AudioStreamWebviewMessage =
  AudioStreamStartRequest | AudioStreamStopRequest | AudioStreamSeekRequest;

/**
 * Union type for audio stream messages from Extension to Webview
 */
export type AudioStreamExtensionMessage =
  AudioStreamStartedResponse | AudioStreamStoppedResponse | AudioStreamDataNotification;
