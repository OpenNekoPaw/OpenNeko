import type { MessageBundle } from '@neko/shared';

export const errors = {
  'errors.generic': '发生错误',
  'errors.networkError': '网络错误',
  'errors.apiKeyRequired': '需要 API 密钥',
  'errors.connectionFailed': '连接失败',
  'errors.timeout': '请求超时',
} as const satisfies MessageBundle;
