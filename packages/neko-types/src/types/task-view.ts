/**
 * Task View Types - DTO for Extension ↔ Webview communication
 *
 * These types define the flattened data structures used for displaying
 * tasks in the UI. They are separate from Platform's core Task types.
 */

/**
 * Task type (must match Platform's TaskType)
 */
export type TaskViewType =
  | 'image_generation'
  | 'video_generation'
  | 'audio_generation'
  | 'embedding'
  | 'workflow'
  | 'mcp'
  | 'custom';

/**
 * Task status (must match Platform's TaskStatus)
 */
export type TaskViewStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Task view for UI display
 * Flattened structure optimized for frontend rendering
 */
export interface TaskView {
  /** Unique task ID */
  id: string;
  /** Task type */
  type: TaskViewType;
  /** Display name (from payload or fallback to type) */
  name: string;
  /** Prompt text if applicable */
  prompt?: string;
  /** Provider ID if applicable */
  providerId?: string;
  /** Provider name if applicable */
  providerName?: string;
  /** Task status */
  status: TaskViewStatus;
  /** Progress 0-100 */
  progress: number;
  /** Created timestamp as ISO string */
  createdAt: string;
  /** Updated timestamp as ISO string */
  updatedAt: string;
  /** Result data when completed */
  result?: unknown;
  /** Error message if failed */
  error?: string;
}
