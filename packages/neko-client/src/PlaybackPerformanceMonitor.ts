/**
 * PlaybackPerformanceMonitor - 播放性能监控服务
 *
 * 职责（单一职责原则）：
 * - 实时 FPS 计算（基于滑动窗口）
 * - 帧时间分布（P50/P95/P99 百分位）
 * - 渲染时间追踪（Canvas drawImage 耗时）
 * - 内存使用监测（Chrome performance.memory）
 * - 数据吞吐统计（H.264 比特率）
 *
 * 设计原则：
 * - 独立于 H264StreamClient 和 PreviewPanel，通过回调注入数据
 * - 无外部依赖，纯计算逻辑
 * - 滑动窗口避免无限内存增长
 */

export interface PerformanceSnapshot {
  /** 实测帧率（基于滑动窗口内的帧计数） */
  measuredFps: number;
  /** 帧时间 50th 百分位 (ms) */
  frameTimeP50: number;
  /** 帧时间 95th 百分位 (ms) */
  frameTimeP95: number;
  /** 帧时间 99th 百分位 (ms) */
  frameTimeP99: number;
  /** 平均渲染时间 (Canvas drawImage 耗时, ms) */
  avgRenderTimeMs: number;
  /** 内存使用量 (MB) */
  memoryUsedMB: number;
  /** 实时比特率 (kbps) */
  bitrateKbps: number;
  /** 总帧数 */
  totalFrames: number;
  /** 丢帧数 */
  droppedFrames: number;
}

/** Chrome 扩展的 performance.memory 接口 */
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/** 扩展 Performance 接口以包含 Chrome memory 属性 */
interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

/** FPS 计算使用的滑动窗口大小（毫秒） */
const FPS_WINDOW_MS = 1000;

/** 帧时间样本的最大保留数量 */
const MAX_FRAME_TIME_SAMPLES = 300;

/** 渲染时间样本的最大保留数量 */
const MAX_RENDER_TIME_SAMPLES = 120;

/** 比特率计算使用的滑动窗口大小（毫秒） */
const BITRATE_WINDOW_MS = 2000;

export class PlaybackPerformanceMonitor {
  // --- FPS 滑动窗口 ---
  private frameTimestamps: number[] = [];

  // --- 帧时间分布 ---
  private frameTimeSamples: number[] = [];
  private lastFrameTimestamp = 0;

  // --- 渲染时间 ---
  private renderTimeSamples: number[] = [];

  // --- 比特率 ---
  private packetRecords: Array<{ timestamp: number; bytes: number }> = [];

  // --- 计数器 ---
  private totalFrames = 0;
  private droppedFrames = 0;

  /**
   * 每次 VideoFrame 输出时调用
   * 记录帧到达时间戳，计算帧间隔
   */
  recordFrame(): void {
    const now = performance.now();
    this.totalFrames++;

    // 记录帧时间戳用于 FPS 计算
    this.frameTimestamps.push(now);

    // 计算帧间隔用于百分位分布
    if (this.lastFrameTimestamp > 0) {
      const interval = now - this.lastFrameTimestamp;
      this.frameTimeSamples.push(interval);
      if (this.frameTimeSamples.length > MAX_FRAME_TIME_SAMPLES) {
        this.frameTimeSamples.shift();
      }
    }
    this.lastFrameTimestamp = now;

    // 清理过期的帧时间戳（保留窗口内的）
    const cutoff = now - FPS_WINDOW_MS;
    while (this.frameTimestamps.length > 0 && this.frameTimestamps[0]! < cutoff) {
      this.frameTimestamps.shift();
    }
  }

  /**
   * 每次 Canvas drawImage 后调用
   * @param ms 渲染耗时（毫秒）
   */
  recordRenderTime(ms: number): void {
    this.renderTimeSamples.push(ms);
    if (this.renderTimeSamples.length > MAX_RENDER_TIME_SAMPLES) {
      this.renderTimeSamples.shift();
    }
  }

  /**
   * 每次 WebSocket 消息接收后调用
   * @param bytes 数据包大小（字节）
   */
  recordPacketSize(bytes: number): void {
    this.packetRecords.push({ timestamp: performance.now(), bytes });

    // 清理过期记录
    const cutoff = performance.now() - BITRATE_WINDOW_MS;
    while (this.packetRecords.length > 0 && this.packetRecords[0]!.timestamp < cutoff) {
      this.packetRecords.shift();
    }
  }

  /**
   * 记录丢帧
   * @param count 丢帧数量
   */
  recordDroppedFrames(count: number): void {
    this.droppedFrames += count;
  }

  /**
   * 获取当前性能快照
   */
  getSnapshot(): PerformanceSnapshot {
    return {
      measuredFps: this.calculateFps(),
      frameTimeP50: this.calculatePercentile(this.frameTimeSamples, 0.5),
      frameTimeP95: this.calculatePercentile(this.frameTimeSamples, 0.95),
      frameTimeP99: this.calculatePercentile(this.frameTimeSamples, 0.99),
      avgRenderTimeMs: this.calculateAverage(this.renderTimeSamples),
      memoryUsedMB: this.getMemoryUsage(),
      bitrateKbps: this.calculateBitrate(),
      totalFrames: this.totalFrames,
      droppedFrames: this.droppedFrames,
    };
  }

  /**
   * 播放开始/停止时重置所有数据
   */
  reset(): void {
    this.frameTimestamps = [];
    this.frameTimeSamples = [];
    this.lastFrameTimestamp = 0;
    this.renderTimeSamples = [];
    this.packetRecords = [];
    this.totalFrames = 0;
    this.droppedFrames = 0;
  }

  // =========================================================================
  // 内部计算方法
  // =========================================================================

  private calculateFps(): number {
    if (this.frameTimestamps.length < 2) {
      return 0;
    }
    // 滑动窗口内的帧数 / 窗口时间跨度
    const windowSpan =
      this.frameTimestamps[this.frameTimestamps.length - 1]! - this.frameTimestamps[0]!;
    if (windowSpan <= 0) {
      return 0;
    }
    return ((this.frameTimestamps.length - 1) / windowSpan) * 1000;
  }

  private calculatePercentile(samples: number[], percentile: number): number {
    if (samples.length === 0) {
      return 0;
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)]!;
  }

  private calculateAverage(samples: number[]): number {
    if (samples.length === 0) {
      return 0;
    }
    return samples.reduce((sum, v) => sum + v, 0) / samples.length;
  }

  private getMemoryUsage(): number {
    const perf = performance as PerformanceWithMemory;
    if (perf.memory) {
      return perf.memory.usedJSHeapSize / (1024 * 1024);
    }
    return 0;
  }

  private calculateBitrate(): number {
    if (this.packetRecords.length < 2) {
      return 0;
    }
    const now = performance.now();
    const windowStart = now - BITRATE_WINDOW_MS;

    let totalBytes = 0;
    let earliestTimestamp = now;
    for (const record of this.packetRecords) {
      if (record.timestamp >= windowStart) {
        totalBytes += record.bytes;
        if (record.timestamp < earliestTimestamp) {
          earliestTimestamp = record.timestamp;
        }
      }
    }

    const durationSec = (now - earliestTimestamp) / 1000;
    if (durationSec <= 0) {
      return 0;
    }
    // bytes -> kbps: (bytes * 8) / 1000 / durationSec
    return (totalBytes * 8) / 1000 / durationSec;
  }
}
