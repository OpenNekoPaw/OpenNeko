import { describe, expect, it } from 'vitest';
import type {
  DisposableLike,
  TrackingData,
  TrackingServiceApi,
  TrackingStatus,
} from '../../index';

function expectJsonSerializable(value: unknown): void {
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
}

describe('tracking shared contracts', () => {
  it('models tracking data and service API through disposable-like handles', async () => {
    const frame: TrackingData = {
      source: 'vmc',
      timestamp: 1,
      blendShapes: { jawOpen: 0.4 },
      headRotation: [0, 0, 0, 1],
      boneTransforms: {
        Head: { rotation: [0, 0, 0, 1], position: [0, 1, 0] },
      },
    };
    const inactive: TrackingStatus = { source: 'vmc', active: false, fps: 0 };
    let disposed = false;
    const disposable: DisposableLike = {
      dispose: () => {
        disposed = true;
      },
    };
    const api: TrackingServiceApi = {
      start: async () => ({ source: 'vmc', active: true, fps: 60, port: 39539 }),
      stop: async () => inactive,
      status: async () => inactive,
      onTrackingData: () => disposable,
      onStatusChange: () => disposable,
    };

    expectJsonSerializable(frame);
    expect(await api.status('vmc')).toEqual(inactive);
    api.onTrackingData(() => undefined).dispose();
    expect(disposed).toBe(true);
  });
});
