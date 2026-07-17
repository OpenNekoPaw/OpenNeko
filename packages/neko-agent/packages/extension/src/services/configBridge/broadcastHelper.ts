/**
 * WebviewBroadcaster - Eliminates repeated broadcast for-loop+try-catch
 */

import { getLogger } from '../../base';
import type { PostMessageFn } from './types';

const logger = getLogger('WebviewBroadcaster');

/**
 * Broadcasts a message to all registered webviews with error handling
 */
export function broadcastToWebviews(
  webviews: Set<PostMessageFn>,
  message: Parameters<PostMessageFn>[0],
): void {
  for (const postMessage of webviews) {
    try {
      postMessage(message);
    } catch (error) {
      logger.error('Failed to broadcast message:', error);
    }
  }
}
