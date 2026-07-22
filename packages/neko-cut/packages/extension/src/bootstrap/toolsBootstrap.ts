/** Result contract retained for the canonical host-owned timeline command path. */
export interface TimelineToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
