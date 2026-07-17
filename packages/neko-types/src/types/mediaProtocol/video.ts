/**
 * Media Processing Protocol - YUV420P Video Types
 *
 * Zero-copy video decoding types and utilities.
 */

import { ConsoleLogger } from '../../logger/console-logger';
import { LogLevel } from '../../logger/types';

const logger = new ConsoleLogger('MediaProtocol', LogLevel.Debug);

// =============================================================================
// YUV420P Frame Data Types (Zero-copy video decoding)
// =============================================================================

/**
 * YUV 色彩空间标准
 *
 * 不同分辨率的视频使用不同的色彩空间标准：
 * - BT.601: SD 视频 (DVD, 标清广播)
 * - BT.709: HD 视频 (HDTV, Blu-ray, 1080p)
 * - BT.2020: UHD/4K 视频 (HDR)
 */
export enum YuvColorSpace {
  /** BT.601 - SD 视频 (< 720p) */
  BT601 = 0,
  /** BT.709 - HD 视频 (720p - 1080p) */
  BT709 = 1,
  /** BT.2020 - UHD/4K 视频 (> 1080p) */
  BT2020 = 2,
}

/**
 * 根据视频分辨率检测色彩空间
 */
export function detectYuvColorSpace(width: number, height: number): YuvColorSpace {
  if (width >= 3840 || height >= 2160) {
    return YuvColorSpace.BT2020;
  }
  if (width >= 1280 || height >= 720) {
    return YuvColorSpace.BT709;
  }
  return YuvColorSpace.BT601;
}

/**
 * YUV420P 帧数据
 *
 * YUV420P 是 FFmpeg 默认的解码输出格式，数据布局：
 * - Y 平面：width × height 字节（亮度）
 * - U 平面：(width/2) × (height/2) 字节（色度 Cb）
 * - V 平面：(width/2) × (height/2) 字节（色度 Cr）
 * - 总大小：width × height × 1.5 字节
 *
 * 相比 RGBA 格式（width × height × 4 字节），YUV420P 节省约 62.5% 的内存和带宽。
 */
export interface Yuv420pFrameData {
  /** 帧时间（秒） */
  time: number;
  /** 帧宽度 */
  width: number;
  /** 帧高度 */
  height: number;
  /** 像素格式标识 */
  pixelFormat: 'yuv420p';
  /** 色彩空间 */
  colorSpace: YuvColorSpace;
  /** Y 平面数据（亮度，全分辨率） */
  yPlane: Uint8Array;
  /** U 平面数据（色度 Cb，半分辨率） */
  uPlane: Uint8Array;
  /** V 平面数据（色度 Cr，半分辨率） */
  vPlane: Uint8Array;
}

/**
 * 计算 YUV420P 帧的各平面大小
 */
export function calculateYuv420pPlaneSizes(
  width: number,
  height: number,
): {
  ySize: number;
  uSize: number;
  vSize: number;
  totalSize: number;
} {
  const ySize = width * height;
  const uvSize = (width / 2) * (height / 2);
  return {
    ySize,
    uSize: uvSize,
    vSize: uvSize,
    totalSize: ySize + uvSize * 2,
  };
}

/**
 * 从连续的 YUV420P 缓冲区解析出各平面
 */
export function parseYuv420pBuffer(
  buffer: Uint8Array,
  width: number,
  height: number,
): { yPlane: Uint8Array; uPlane: Uint8Array; vPlane: Uint8Array } | null {
  const sizes = calculateYuv420pPlaneSizes(width, height);

  if (buffer.length < sizes.totalSize) {
    logger.error(
      `YUV420P buffer too small: expected ${sizes.totalSize} bytes, got ${buffer.length}`,
    );
    return null;
  }

  return {
    yPlane: buffer.subarray(0, sizes.ySize),
    uPlane: buffer.subarray(sizes.ySize, sizes.ySize + sizes.uSize),
    vPlane: buffer.subarray(sizes.ySize + sizes.uSize, sizes.totalSize),
  };
}
