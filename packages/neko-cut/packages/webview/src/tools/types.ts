/**
 * Tool Types for Webview
 */

/**
 * Tool execution request from Extension
 */
export interface ToolExecuteRequest {
  type: 'tool.execute';
  requestId: string;
  toolName: string;
  params: Record<string, unknown>;
}

/**
 * Tool execution result to Extension
 */
export interface ToolExecuteResult {
  type: 'tool.result';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Tool handler function type
 */
export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolHandlerResult>;

/**
 * Tool handler result
 */
export interface ToolHandlerResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
