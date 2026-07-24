import type {
  MediaAdapter,
  MediaAudioSubmitter,
  MediaImageSubmitter,
  MediaTaskCanceller,
  MediaTaskDescriber,
  MediaVideoSubmitter,
} from '@neko/generation';

export type MediaAdapterCapabilityErrorCode =
  | 'media-image-submit-unsupported'
  | 'media-video-submit-unsupported'
  | 'media-audio-submit-unsupported'
  | 'media-task-describe-unsupported'
  | 'media-task-cancel-unsupported';

export class MediaAdapterCapabilityError extends Error {
  constructor(
    readonly code: MediaAdapterCapabilityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MediaAdapterCapabilityError';
  }
}

export function isMediaImageSubmitter(
  adapter: MediaAdapter,
): adapter is MediaAdapter & MediaImageSubmitter {
  return 'generateImage' in adapter && typeof adapter.generateImage === 'function';
}

export function isMediaVideoSubmitter(
  adapter: MediaAdapter,
): adapter is MediaAdapter & MediaVideoSubmitter {
  return 'generateVideo' in adapter && typeof adapter.generateVideo === 'function';
}

export function isMediaAudioSubmitter(
  adapter: MediaAdapter,
): adapter is MediaAdapter & MediaAudioSubmitter {
  return 'generateAudio' in adapter && typeof adapter.generateAudio === 'function';
}

export function isMediaTaskDescriber(
  adapter: MediaAdapter,
): adapter is MediaAdapter & MediaTaskDescriber {
  return 'getTaskStatus' in adapter && typeof adapter.getTaskStatus === 'function';
}

export function isMediaTaskCanceller(
  adapter: MediaAdapter,
): adapter is MediaAdapter & MediaTaskCanceller {
  return 'cancelTask' in adapter && typeof adapter.cancelTask === 'function';
}

export function requireMediaTaskDescriber(
  adapter: MediaAdapter,
): MediaAdapter & MediaTaskDescriber {
  if (isMediaTaskDescriber(adapter)) return adapter;
  throw new MediaAdapterCapabilityError(
    'media-task-describe-unsupported',
    `Media adapter ${adapter.type} does not support asynchronous task description.`,
  );
}

export function requireMediaImageSubmitter(
  adapter: MediaAdapter,
): MediaAdapter & MediaImageSubmitter {
  if (isMediaImageSubmitter(adapter)) return adapter;
  throw new MediaAdapterCapabilityError(
    'media-image-submit-unsupported',
    `Media adapter ${adapter.type} does not support image submission.`,
  );
}

export function requireMediaVideoSubmitter(
  adapter: MediaAdapter,
): MediaAdapter & MediaVideoSubmitter {
  if (isMediaVideoSubmitter(adapter)) return adapter;
  throw new MediaAdapterCapabilityError(
    'media-video-submit-unsupported',
    `Media adapter ${adapter.type} does not support video submission.`,
  );
}

export function requireMediaAudioSubmitter(
  adapter: MediaAdapter,
): MediaAdapter & MediaAudioSubmitter {
  if (isMediaAudioSubmitter(adapter)) return adapter;
  throw new MediaAdapterCapabilityError(
    'media-audio-submit-unsupported',
    `Media adapter ${adapter.type} does not support audio submission.`,
  );
}

export function requireMediaTaskCanceller(
  adapter: MediaAdapter,
): MediaAdapter & MediaTaskCanceller {
  if (isMediaTaskCanceller(adapter)) return adapter;
  throw new MediaAdapterCapabilityError(
    'media-task-cancel-unsupported',
    `Media adapter ${adapter.type} does not support task cancellation.`,
  );
}
