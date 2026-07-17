/**
 * Retry/Timeout Presets
 *
 * Inline constants replacing the previous JSON-based i18n presets.
 */

import type { RetryTimeoutPreset, BuiltinPresetName } from '../types/error';

/**
 * Built-in retry/timeout presets
 */
export const RETRY_TIMEOUT_PRESETS: Record<BuiltinPresetName, RetryTimeoutPreset> = {
  modelCall: {
    name: 'Model Call',
    retry: {
      maxRetries: 4,
      backoffStrategy: {
        type: 'exponential',
        initialDelayMs: 2000,
        multiplier: 2,
        maxDelayMs: 30000,
      },
      retryableCategories: ['rate_limit', 'timeout', 'network', 'server'],
    },
    timeout: {
      requestTimeout: 360000,
      totalTimeout: 600000,
      streamTimeout: 360000,
    },
  },
  toolExecution: {
    name: 'Tool Execution',
    retry: {
      maxRetries: 2,
      backoffStrategy: {
        type: 'fixed',
        delayMs: 1000,
      },
      retryableCategories: ['timeout', 'network'],
    },
    timeout: {
      requestTimeout: 30000,
      totalTimeout: 60000,
    },
  },
  mcpRequest: {
    name: 'MCP Request',
    retry: {
      maxRetries: 2,
      backoffStrategy: {
        type: 'linear',
        initialDelayMs: 500,
        incrementMs: 500,
        maxDelayMs: 5000,
      },
      retryableCategories: ['timeout', 'network', 'server'],
    },
    timeout: {
      requestTimeout: 30000,
      totalTimeout: 90000,
    },
  },
  workflowExecution: {
    name: 'Workflow Execution',
    retry: {
      maxRetries: 1,
      backoffStrategy: {
        type: 'fixed',
        delayMs: 2000,
      },
      retryableCategories: ['timeout', 'network'],
    },
    timeout: {
      requestTimeout: 300000,
      totalTimeout: 600000,
    },
  },
};
