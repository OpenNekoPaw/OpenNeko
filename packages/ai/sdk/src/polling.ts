/**
 * Polling Strategy
 *
 * Shared polling logic with per-media-type presets.
 * Supports fixed interval and linear backoff strategies.
 */

/**
 * Polling configuration
 */
export interface PollingConfig {
  /** Initial interval between polls (ms) */
  initialIntervalMs: number;
  /** Maximum interval between polls (ms) */
  maxIntervalMs: number;
  /** Interval growth per attempt (ms), 0 for fixed interval */
  backoffStepMs: number;
  /** Maximum total time before timeout (ms) */
  timeoutMs: number;
}

/**
 * Per-media-type polling presets
 */
export const POLLING_PRESETS = {
  /** Image: fast polling, short timeout (typically 5-30s) */
  image: {
    initialIntervalMs: 2000,
    maxIntervalMs: 2000,
    backoffStepMs: 0,
    timeoutMs: 2 * 60 * 1000, // 2 min
  },
  /** Video: moderate start, linear backoff, long timeout */
  video: {
    initialIntervalMs: 5000,
    maxIntervalMs: 15000,
    backoffStepMs: 1000,
    timeoutMs: 30 * 60 * 1000, // 30 min
  },
  /** Audio/TTS: fast polling, moderate timeout */
  audio: {
    initialIntervalMs: 2000,
    maxIntervalMs: 2000,
    backoffStepMs: 0,
    timeoutMs: 5 * 60 * 1000, // 5 min
  },
  /** Music: similar to video (generation can be slow) */
  music: {
    initialIntervalMs: 5000,
    maxIntervalMs: 15000,
    backoffStepMs: 1000,
    timeoutMs: 30 * 60 * 1000, // 30 min
  },
} as const satisfies Record<string, PollingConfig>;

/**
 * Poll an async operation until it completes or times out.
 *
 * @param poll - Function that checks the current status. Return the result when done,
 *   or undefined to continue polling.
 * @param config - Polling configuration (use POLLING_PRESETS or custom)
 * @param abortSignal - Optional abort signal for cancellation
 * @returns The result from the poll function
 */
export async function pollUntilDone<T>(
  poll: () => Promise<T | undefined>,
  config: PollingConfig,
  abortSignal?: AbortSignal,
): Promise<T> {
  const startTime = Date.now();
  let currentInterval = config.initialIntervalMs;

  while (Date.now() - startTime < config.timeoutMs) {
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    await new Promise((resolve) => setTimeout(resolve, currentInterval));

    const result = await poll();
    if (result !== undefined) {
      return result;
    }

    // Apply linear backoff
    if (config.backoffStepMs > 0) {
      currentInterval = Math.min(currentInterval + config.backoffStepMs, config.maxIntervalMs);
    }
  }

  const elapsedSec = Math.round((Date.now() - startTime) / 1000);
  throw new Error(`Operation timed out after ${elapsedSec}s`);
}
