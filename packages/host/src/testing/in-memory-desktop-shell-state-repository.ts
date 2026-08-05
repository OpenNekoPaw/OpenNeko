import {
  createEmptyDesktopShellState,
  parseDesktopShellStoredState,
  serializeDesktopShellStoredState,
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
    read: async () => cloneState(state),
    commit: async (next) => {
      const parsed = parseDesktopShellStoredState(next);
      state = parsed;
      return cloneState(state);
    },
  };
}

function cloneState(state: DesktopShellStoredState): DesktopShellStoredState {
  return parseDesktopShellStoredState(structuredClone(serializeDesktopShellStoredState(state)));
}
