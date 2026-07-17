/**
 * Core module - Shared abstractions and utilities
 */

// Base Registry
export { BaseRegistry, type IRegistry } from './base-registry';

// HTTP Client
export {
  type HttpRequestConfig,
  type HttpError,
  type HttpResult,
  HttpClient,
  getHttpClient,
  createHttpClient,
} from './http-client';

// Concurrency Control - Re-export from shared
export {
  type ConcurrencyPoolOptions,
  type PoolStats,
  ConcurrencyPool,
  KeyedConcurrencyPool,
  withConcurrencyLimit,
} from '@neko/shared';
