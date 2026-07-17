/**
 * LoudnessService - Webview-side loudness analysis proxy
 *
 * Sends analysis requests to Extension Host via postMessage,
 * which dispatches to Rust `audios:analyze_loudness`.
 *
 * Follows the same requestId + message listener pattern
 * used by MediaRequestProxy.getMediaBitrate().
 */

import { getVSCodeAPI } from '../utils/vscodeApi';
import { getLogger } from '../utils/logger';

const logger = getLogger('LoudnessService');

// =============================================================================
// Types
// =============================================================================

export interface LoudnessAnalysisResult {
  integratedLufs: number;
  truePeakDbfs: number;
  loudnessRange: number;
  recommendedGain: number;
  targetLufs: number;
}

export interface LoudnessAnalysisItem {
  source: string;
  analysis?: LoudnessAnalysisResult;
  error?: string;
}

// =============================================================================
// LoudnessService
// =============================================================================

const LOUDNESS_TIMEOUT_MS = 30_000;

let requestIdCounter = 0;
const pendingRequests = new Map<
  string,
  {
    resolve: (results: LoudnessAnalysisItem[]) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }
>();

function handleMessage(event: MessageEvent): void {
  const message = event.data;
  if (typeof message !== 'object' || message === null) return;

  const msg = message as Record<string, unknown>;
  if (msg.type !== 'media:response:analyzeLoudness') return;

  const requestId = msg.requestId as string;
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  clearTimeout(pending.timeoutId);
  pendingRequests.delete(requestId);

  if (msg.error) {
    pending.reject(new Error(msg.error as string));
  } else {
    const payload = msg.payload as { results: LoudnessAnalysisItem[] } | undefined;
    pending.resolve(payload?.results ?? []);
  }
}

// Register global listener once
let listenerRegistered = false;

function ensureListener(): void {
  if (listenerRegistered) return;
  window.addEventListener('message', handleMessage);
  listenerRegistered = true;
}

/**
 * Analyze loudness for one or more audio/video files.
 *
 * @param sources - Array of media file paths
 * @param targetLufs - Target LUFS for recommended gain (default: -14)
 * @returns Per-file analysis results
 */
export async function analyzeLoudness(
  sources: string[],
  targetLufs = -14,
): Promise<LoudnessAnalysisItem[]> {
  ensureListener();

  const vscode = getVSCodeAPI();
  if (!vscode) {
    throw new Error('VSCode API not available');
  }

  const requestId = `loudness_${Date.now()}_${requestIdCounter++}`;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Loudness analysis request timeout'));
    }, LOUDNESS_TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, reject, timeoutId });

    vscode.postMessage({
      type: 'media:analyzeLoudness',
      requestId,
      timestamp: Date.now(),
      payload: { sources, targetLufs },
    });

    logger.debug(`Sent loudness analysis request: ${sources.length} file(s)`);
  });
}
