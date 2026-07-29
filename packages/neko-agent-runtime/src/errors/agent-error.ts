/**
 * AgentError - Agent-specific error class
 *
 * Extends BaseError with agent-specific error categories.
 */

import { BaseError, type BaseErrorInfo, type ErrorCategory } from '@neko/shared';

/**
 * Agent-specific error categories (subset of ErrorCategory)
 */
export type AgentErrorCategory = Extract<
  ErrorCategory,
  | 'mcp'
  | 'tool'
  | 'execution'
  | 'permission'
  | 'validation'
  | 'skill'
  | 'timeout'
  | 'network'
  | 'server'
  | 'unknown'
>;

/**
 * Agent error info
 */
export interface AgentErrorInfo extends Omit<BaseErrorInfo, 'category'> {
  category: AgentErrorCategory;
}

/**
 * Agent error class
 */
export class AgentError extends BaseError {
  constructor(info: AgentErrorInfo) {
    super(info as BaseErrorInfo);
    this.name = 'AgentError';
  }

  /**
   * Create MCP error
   */
  static mcp(message: string, cause?: Error): AgentError {
    return new AgentError({
      category: 'mcp',
      code: 'MCP_ERROR',
      message,
      retryable: true,
      cause,
    });
  }

  /**
   * Create tool execution error
   */
  static tool(message: string, toolName: string, cause?: Error): AgentError {
    return new AgentError({
      category: 'tool',
      code: 'TOOL_ERROR',
      message,
      retryable: false,
      cause,
      context: { toolName },
    });
  }

  /**
   * Create execution error
   */
  static execution(message: string, cause?: Error): AgentError {
    return new AgentError({
      category: 'execution',
      code: 'EXECUTION_ERROR',
      message,
      retryable: false,
      cause,
    });
  }

  /**
   * Create permission error
   */
  static permission(message: string, toolName?: string): AgentError {
    return new AgentError({
      category: 'permission',
      code: 'PERMISSION_DENIED',
      message,
      retryable: false,
      context: toolName ? { toolName } : undefined,
    });
  }

  /**
   * Create validation error
   */
  static validation(message: string, details?: Record<string, unknown>): AgentError {
    return new AgentError({
      category: 'validation',
      code: 'VALIDATION_ERROR',
      message,
      retryable: false,
      context: details,
    });
  }

  /**
   * Create skill error
   */
  static skill(message: string, skillId?: string): AgentError {
    return new AgentError({
      category: 'skill',
      code: 'SKILL_ERROR',
      message,
      retryable: false,
      context: skillId ? { skillId } : undefined,
    });
  }

  /**
   * Create timeout error
   */
  static timeout(message: string, timeoutMs: number): AgentError {
    return new AgentError({
      category: 'timeout',
      code: 'TIMEOUT',
      message,
      retryable: true,
      context: { timeoutMs },
    });
  }
}
