import {
  createEmptyDesktopShellState,
  DesktopShellStateError,
  parseDesktopShellStoredState,
  type DesktopShellStateRepositoryPort,
  type DesktopShellStoredState,
} from '@neko/host/desktop-shell-state';

export interface InMemoryDesktopShellStateRepository extends DesktopShellStateRepositoryPort {
  applicationCount: number;
}

export function createInMemoryDesktopShellStateRepository(
  initial: DesktopShellStoredState = createEmptyDesktopShellState(),
): InMemoryDesktopShellStateRepository {
  let state = parseDesktopShellStoredState(initial);
  return {
    applicationCount: 0,
    read: async () => structuredClone(state),
    commit: async (expectedRevision, next) => {
      if (state.storageRevision !== expectedRevision) {
        throw new DesktopShellStateError(
          'desktop-shell-stale-storage-revision',
          `Desktop Shell storage revision ${expectedRevision} is stale; current revision is ${state.storageRevision}.`,
        );
      }
      const parsed = parseDesktopShellStoredState(next);
      if (parsed.storageRevision !== expectedRevision + 1) {
        throw new DesktopShellStateError(
          'desktop-shell-invalid-state',
          `Desktop Shell commit must advance storage revision from ${expectedRevision} to ${expectedRevision + 1}.`,
        );
      }
      state = parsed;
      return structuredClone(state);
    },
  };
}
