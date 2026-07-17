/**
 * Source-neutral live tracking contracts.
 *
 * Tracking sources include VMC today and camera/XR/manual sources later.
 * Consumers map these data into their own renderer or engine domain.
 */

export interface DisposableLike {
  dispose(): void;
}

export type TrackingSource = 'vmc' | 'camera-face' | 'xr' | 'manual';

export interface TrackingBoneTransform {
  rotation: readonly [number, number, number, number];
  position?: readonly [number, number, number];
}

export interface TrackingData {
  source: TrackingSource;
  timestamp: number;
  blendShapes: Record<string, number>;
  headRotation?: readonly [number, number, number, number];
  headPosition?: readonly [number, number, number];
  boneTransforms?: Record<string, TrackingBoneTransform>;
}

export interface TrackingStatus {
  source: TrackingSource;
  active: boolean;
  fps: number;
  port?: number;
  errorMessage?: string;
}

export interface TrackingStartOptions {
  source?: TrackingSource;
  port?: number;
}

export interface TrackingServiceApi {
  start(options?: TrackingStartOptions): Promise<TrackingStatus>;
  stop(source?: TrackingSource): Promise<TrackingStatus>;
  status(source?: TrackingSource): Promise<TrackingStatus>;
  onTrackingData(listener: (data: TrackingData) => void): DisposableLike;
  onStatusChange(listener: (status: TrackingStatus) => void): DisposableLike;
}
