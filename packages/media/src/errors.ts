import type { MediaFailureScope } from './contracts';

export class MediaRuntimeUnavailableError extends Error {
  constructor(
    readonly capability: string,
    detail?: string,
  ) {
    super(detail ?? `Media runtime is unavailable for ${capability}.`);
    this.name = 'MediaRuntimeUnavailableError';
  }
}

export class MediaCorruptionError extends Error {
  constructor(
    readonly scope: Exclude<MediaFailureScope, 'operation'>,
    readonly operation: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'MediaCorruptionError';
  }
}
