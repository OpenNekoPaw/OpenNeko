import {
  DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
  DesktopApplicationSettingsContractError,
  parseDesktopApplicationPreferences,
  type DesktopApplicationPreferences,
  type DesktopApplicationSettingsProjection,
  type DesktopApplicationSettingsProjectionEvent,
} from './application-settings-contract';

export interface DesktopApplicationSettingsStoredState {
  readonly schemaVersion: typeof DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION;
  readonly storageRevision: number;
  readonly preferences: DesktopApplicationPreferences;
}

export interface DesktopApplicationSettingsRepositoryPort {
  read(): Promise<DesktopApplicationSettingsStoredState>;
  commit(
    expectedRevision: number,
    next: DesktopApplicationSettingsStoredState,
  ): Promise<DesktopApplicationSettingsStoredState>;
}

export class DesktopApplicationSettingsService {
  private state: DesktopApplicationSettingsStoredState | undefined;
  private eventSequence = 0;
  private operationTail: Promise<void> = Promise.resolve();
  private readonly subscribers = new Set<
    (event: DesktopApplicationSettingsProjectionEvent) => void
  >();
  private disposed = false;

  constructor(private readonly repository: DesktopApplicationSettingsRepositoryPort) {}

  async initialize(): Promise<DesktopApplicationSettingsProjection> {
    if (this.state) return this.project();
    this.state = await this.repository.read();
    return this.project();
  }

  get current(): DesktopApplicationSettingsProjection {
    this.requireActive();
    return this.project();
  }

  subscribe(listener: (event: DesktopApplicationSettingsProjectionEvent) => void): () => void {
    this.requireActive();
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  async update(
    expectedRevision: number,
    preferences: DesktopApplicationPreferences,
  ): Promise<DesktopApplicationSettingsProjection> {
    let resolveResult!: (value: DesktopApplicationSettingsProjection) => void;
    let rejectResult!: (reason?: unknown) => void;
    const result = new Promise<DesktopApplicationSettingsProjection>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    const operation = this.operationTail.then(async () => {
      this.requireActive();
      const current = this.requireState();
      if (current.storageRevision !== expectedRevision) {
        throw new DesktopApplicationSettingsContractError(
          'desktop-application-settings-stale-revision',
          `Desktop settings revision ${expectedRevision} is stale; current revision is ${current.storageRevision}.`,
        );
      }
      const committed = await this.repository.commit(expectedRevision, {
        schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
        storageRevision: expectedRevision + 1,
        preferences: parseDesktopApplicationPreferences(preferences),
      });
      this.state = committed;
      this.eventSequence += 1;
      const projection = this.project();
      const event: DesktopApplicationSettingsProjectionEvent = {
        schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
        sequence: this.eventSequence,
        projection,
      };
      for (const subscriber of this.subscribers) subscriber(event);
      resolveResult(projection);
    });
    this.operationTail = operation.catch((error: unknown) => {
      rejectResult(error);
    });
    return result;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.operationTail;
    this.subscribers.clear();
  }

  private project(): DesktopApplicationSettingsProjection {
    const state = this.requireState();
    return {
      schemaVersion: DESKTOP_APPLICATION_SETTINGS_CONTRACT_VERSION,
      revision: state.storageRevision,
      eventSequence: this.eventSequence,
      preferences: state.preferences,
    };
  }

  private requireState(): DesktopApplicationSettingsStoredState {
    if (!this.state) {
      throw new Error('Desktop application settings service is not initialized.');
    }
    return this.state;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop application settings service is disposed.');
  }
}
