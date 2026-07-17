export interface IRafScheduler {
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number | null | undefined): void;
}

class BrowserRafScheduler implements IRafScheduler {
  requestFrame(callback: FrameRequestCallback): number {
    return window.requestAnimationFrame(callback);
  }

  cancelFrame(handle: number | null | undefined): void {
    if (handle === null || handle === undefined) {
      return;
    }

    window.cancelAnimationFrame(handle);
  }
}

const defaultRafScheduler = new BrowserRafScheduler();

export function getDefaultRafScheduler(): IRafScheduler {
  return defaultRafScheduler;
}
