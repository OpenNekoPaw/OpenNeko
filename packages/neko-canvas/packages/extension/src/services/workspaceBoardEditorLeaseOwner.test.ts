import { describe, expect, it, vi } from 'vitest';
import type { CanvasDocumentLifecycleEvent } from '../editor';
import { WorkspaceBoardEditorLeaseOwner } from './workspaceBoardEditorLeaseOwner';

const WORKSPACE_BOARD_URI = 'file:///workspace/neko/boards/workspace.nkc';

describe('WorkspaceBoardEditorLeaseOwner', () => {
  it('owns and renews the writer while the Board is open, draining only clean ready state', async () => {
    const events = new LifecycleEvents();
    const renewal = new RenewalScheduler();
    const coordinator = {
      acquireWriterOwnership: vi.fn(async () => true),
      releaseWriterOwnership: vi.fn(async () => undefined),
      flush: vi.fn(async () => []),
    };
    const owner = new WorkspaceBoardEditorLeaseOwner({
      workspaceBoardDocumentUri: WORKSPACE_BOARD_URI,
      coordinator,
      onDidChangeDocumentLifecycle: events.subscribe,
      scheduleRenewal: renewal.schedule,
    });

    events.emit('opened');
    await owner.whenIdle();
    expect(coordinator.acquireWriterOwnership).toHaveBeenCalledTimes(1);
    expect(coordinator.flush).not.toHaveBeenCalled();

    events.emit('ready');
    await owner.whenIdle();
    expect(coordinator.flush).toHaveBeenCalledTimes(1);

    events.emit('dirty');
    renewal.run();
    await owner.whenIdle();
    expect(coordinator.acquireWriterOwnership).toHaveBeenCalledTimes(4);
    expect(coordinator.flush).toHaveBeenCalledTimes(1);

    events.emit('saved');
    await owner.whenIdle();
    expect(coordinator.flush).toHaveBeenCalledTimes(2);

    events.emit('closed');
    await owner.whenIdle();
    expect(coordinator.releaseWriterOwnership).toHaveBeenCalledTimes(1);
    expect(renewal.disposed).toBe(true);
  });

  it('keeps pending work untouched when another Host owns the writer', async () => {
    const events = new LifecycleEvents();
    const coordinator = {
      acquireWriterOwnership: vi.fn(async () => false),
      releaseWriterOwnership: vi.fn(async () => undefined),
      flush: vi.fn(async () => []),
    };
    const owner = new WorkspaceBoardEditorLeaseOwner({
      workspaceBoardDocumentUri: WORKSPACE_BOARD_URI,
      coordinator,
      onDidChangeDocumentLifecycle: events.subscribe,
      scheduleRenewal: () => ({ dispose: () => undefined }),
    });

    events.emit('opened');
    events.emit('ready');
    await owner.whenIdle();
    expect(coordinator.flush).not.toHaveBeenCalled();

    owner.dispose();
    await owner.whenIdle();
  });

  it('drains persisted pending work when a restarted editor Host becomes ready', async () => {
    const firstEvents = new LifecycleEvents();
    const secondEvents = new LifecycleEvents();
    const coordinator = {
      acquireWriterOwnership: vi
        .fn<() => Promise<boolean>>()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true),
      releaseWriterOwnership: vi.fn(async () => undefined),
      flush: vi.fn(async () => [{ deliveryId: 'delivery:persisted', status: 'projected' }]),
    };
    const firstOwner = new WorkspaceBoardEditorLeaseOwner({
      workspaceBoardDocumentUri: WORKSPACE_BOARD_URI,
      coordinator,
      onDidChangeDocumentLifecycle: firstEvents.subscribe,
      scheduleRenewal: () => ({ dispose: () => undefined }),
    });

    firstEvents.emit('opened');
    firstEvents.emit('ready');
    await firstOwner.whenIdle();
    expect(coordinator.flush).not.toHaveBeenCalled();
    firstOwner.dispose();
    await firstOwner.whenIdle();

    const restartedOwner = new WorkspaceBoardEditorLeaseOwner({
      workspaceBoardDocumentUri: WORKSPACE_BOARD_URI,
      coordinator,
      onDidChangeDocumentLifecycle: secondEvents.subscribe,
      scheduleRenewal: () => ({ dispose: () => undefined }),
    });
    secondEvents.emit('opened');
    secondEvents.emit('ready');
    await restartedOwner.whenIdle();

    expect(coordinator.flush).toHaveBeenCalledTimes(1);
    restartedOwner.dispose();
    await restartedOwner.whenIdle();
  });
});

class LifecycleEvents {
  private readonly listeners = new Set<(event: CanvasDocumentLifecycleEvent) => void>();

  readonly subscribe = (listener: (event: CanvasDocumentLifecycleEvent) => void) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  emit(type: CanvasDocumentLifecycleEvent['type']): void {
    for (const listener of this.listeners) {
      listener({ type, documentUri: WORKSPACE_BOARD_URI });
    }
  }
}

class RenewalScheduler {
  private operation: (() => void) | undefined;
  disposed = false;

  readonly schedule = (operation: () => void) => {
    this.operation = operation;
    return {
      dispose: () => {
        this.disposed = true;
        this.operation = undefined;
      },
    };
  };

  run(): void {
    this.operation?.();
  }
}
