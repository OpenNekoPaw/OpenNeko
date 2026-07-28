import { randomUUID } from 'node:crypto';
import type { DesktopLifecycleEvent, DesktopLifecycleEventType } from '../shared/bridge-contract';
import { DESKTOP_BRIDGE_CONTRACT_VERSION } from '../shared/bridge-contract';
import { isAllowedDesktopRendererUrl } from './security';

export interface DesktopOwnedDisposable {
  dispose(): void;
}

export interface DesktopWindowRegistration {
  readonly windowId: string;
  readonly webContentsId: number;
  readonly allowedOrigin: string;
  readonly rendererEpoch: number;
  readonly sequence: number;
}

export interface DesktopSenderIdentity {
  readonly webContentsId: number;
  readonly frameUrl: string;
}

interface MutableDesktopWindowRegistration {
  readonly windowId: string;
  readonly webContentsId: number;
  readonly allowedOrigin: string;
  readonly disposables: Set<DesktopOwnedDisposable>;
  rendererEpoch: number;
  sequence: number;
  disposed: boolean;
}

export class DesktopWindowRegistry {
  private readonly windows = new Map<string, MutableDesktopWindowRegistration>();
  private readonly windowByWebContents = new Map<number, string>();

  register(input: {
    readonly webContentsId: number;
    readonly allowedOrigin: string;
    readonly windowId?: string;
  }): DesktopWindowRegistration {
    if (!Number.isInteger(input.webContentsId) || input.webContentsId <= 0) {
      throw new Error('Desktop webContentsId must be a positive integer.');
    }
    if (this.windowByWebContents.has(input.webContentsId)) {
      throw new Error(`Desktop webContents '${input.webContentsId}' is already registered.`);
    }
    const windowId = input.windowId ?? randomUUID();
    if (this.windows.has(windowId)) {
      throw new Error(`Desktop window '${windowId}' is already registered.`);
    }
    const record: MutableDesktopWindowRegistration = {
      windowId,
      webContentsId: input.webContentsId,
      allowedOrigin: input.allowedOrigin,
      rendererEpoch: 0,
      sequence: 0,
      disposables: new Set(),
      disposed: false,
    };
    this.windows.set(windowId, record);
    this.windowByWebContents.set(input.webContentsId, windowId);
    return snapshot(record);
  }

  resolveSender(sender: DesktopSenderIdentity): DesktopWindowRegistration {
    const windowId = this.windowByWebContents.get(sender.webContentsId);
    if (!windowId) {
      throw new Error(`Unknown Desktop IPC sender '${sender.webContentsId}'.`);
    }
    const record = this.requireWindow(windowId);
    if (!isAllowedDesktopRendererUrl(sender.frameUrl, record.allowedOrigin)) {
      throw new Error(
        `Desktop IPC sender '${sender.webContentsId}' has unauthorized frame URL '${sender.frameUrl}'.`,
      );
    }
    return snapshot(record);
  }

  addDisposable(windowId: string, disposable: DesktopOwnedDisposable): void {
    const record = this.requireWindow(windowId);
    record.disposables.add(disposable);
  }

  rendererLoading(
    windowId: string,
    applicationInstanceId: string,
  ): DesktopLifecycleEvent {
    const record = this.requireWindow(windowId);
    record.rendererEpoch += 1;
    return this.createLifecycleEvent(record, applicationInstanceId, 'renderer-loading');
  }

  rendererReady(windowId: string, applicationInstanceId: string): DesktopLifecycleEvent {
    const record = this.requireWindow(windowId);
    if (record.rendererEpoch === 0) {
      throw new Error(`Desktop window '${windowId}' became ready before renderer loading.`);
    }
    return this.createLifecycleEvent(record, applicationInstanceId, 'renderer-ready');
  }

  windowClosing(windowId: string, applicationInstanceId: string): DesktopLifecycleEvent {
    return this.createLifecycleEvent(
      this.requireWindow(windowId),
      applicationInstanceId,
      'window-closing',
    );
  }

  get(windowId: string): DesktopWindowRegistration {
    return snapshot(this.requireWindow(windowId));
  }

  disposeWindow(windowId: string): void {
    const record = this.windows.get(windowId);
    if (!record || record.disposed) return;
    record.disposed = true;
    const errors: unknown[] = [];
    for (const disposable of [...record.disposables].reverse()) {
      try {
        disposable.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    record.disposables.clear();
    this.windows.delete(windowId);
    this.windowByWebContents.delete(record.webContentsId);
    if (errors.length > 0) {
      throw new AggregateError(errors, `Failed to dispose Desktop window '${windowId}'.`);
    }
  }

  disposeAll(): void {
    const errors: unknown[] = [];
    for (const windowId of [...this.windows.keys()]) {
      try {
        this.disposeWindow(windowId);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to dispose all Desktop windows.');
    }
  }

  get size(): number {
    return this.windows.size;
  }

  private requireWindow(windowId: string): MutableDesktopWindowRegistration {
    const record = this.windows.get(windowId);
    if (!record || record.disposed) {
      throw new Error(`Unknown or disposed Desktop window '${windowId}'.`);
    }
    return record;
  }

  private createLifecycleEvent(
    record: MutableDesktopWindowRegistration,
    applicationInstanceId: string,
    type: DesktopLifecycleEventType,
  ): DesktopLifecycleEvent {
    if (applicationInstanceId.trim().length === 0) {
      throw new Error('Desktop application instance identity is required.');
    }
    record.sequence += 1;
    return {
      schemaVersion: DESKTOP_BRIDGE_CONTRACT_VERSION,
      applicationInstanceId,
      windowId: record.windowId,
      rendererEpoch: record.rendererEpoch,
      sequence: record.sequence,
      type,
    };
  }
}

function snapshot(record: MutableDesktopWindowRegistration): DesktopWindowRegistration {
  return {
    windowId: record.windowId,
    webContentsId: record.webContentsId,
    allowedOrigin: record.allowedOrigin,
    rendererEpoch: record.rendererEpoch,
    sequence: record.sequence,
  };
}
