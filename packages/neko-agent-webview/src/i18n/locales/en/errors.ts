import type { MessageBundle } from '@neko/shared';

export const errors = {
  'errors.generic': 'An error occurred',
  'errors.networkError': 'Network error',
  'errors.apiKeyRequired': 'API key is required',
  'errors.connectionFailed': 'Connection failed',
  'errors.timeout': 'Request timed out',
} as const satisfies MessageBundle;
