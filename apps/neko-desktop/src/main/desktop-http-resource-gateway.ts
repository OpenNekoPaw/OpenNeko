import {
  NodeMediaLoopbackServer,
  type NodeMediaPublisher,
  type NodeMediaResourceSetEntry,
  type RegisteredMediaFile,
  type RegisteredMediaResourceSet,
  type RegisteredPcmStream,
} from '@neko/media/node';
import type { ILogger } from '@neko/shared';

export interface DesktopHttpResourceOwner {
  readonly windowId: string;
  readonly viewId: string;
  readonly sessionId: string;
  readonly endpointEpoch: string;
  readonly revision: string;
  readonly generation: string;
}

export interface DesktopAuthorizedFileSource {
  readonly absolutePath: string;
  readonly mediaType: string;
  readonly revision: string;
}

export interface DesktopHttpResourceLease {
  readonly url: string;
  release(): void;
}

interface OwnedRegistration {
  readonly owner: DesktopHttpResourceOwner;
  readonly registration: RegisteredMediaFile;
  readonly publisherId?: number;
}

export class DesktopHttpResourceGateway {
  private readonly mediaServer: NodeMediaLoopbackServer;
  private readonly registrations = new Map<string, OwnedRegistration>();
  private nextPublisherId = 1;
  private disposed = false;

  constructor(input: { readonly allowedOrigins: readonly string[]; readonly logger: ILogger }) {
    this.mediaServer = new NodeMediaLoopbackServer({
      allowedOrigins: input.allowedOrigins,
      logger: input.logger,
    });
  }

  start(): Promise<string> {
    this.requireActive();
    return this.mediaServer.start();
  }

  async registerFile(
    owner: DesktopHttpResourceOwner,
    source: DesktopAuthorizedFileSource,
  ): Promise<DesktopHttpResourceLease> {
    this.requireActive();
    assertOwner(owner);
    const registration = await this.mediaServer.registerFile(
      source.absolutePath,
      source.mediaType,
      source.revision,
    );
    return this.own(owner, registration, registration.url);
  }

  async registerResourceSet(
    owner: DesktopHttpResourceOwner,
    entries: readonly NodeMediaResourceSetEntry[],
    entryPath: string,
  ): Promise<DesktopHttpResourceLease> {
    this.requireActive();
    assertOwner(owner);
    const registration = await this.mediaServer.registerResourceSet(entries, entryPath);
    return this.own(owner, registration, registration.entryUrl);
  }

  createMediaPublisher(owner: Omit<DesktopHttpResourceOwner, 'generation'>): NodeMediaPublisher {
    this.requireActive();
    assertPartialOwner(owner);
    const publisherId = this.nextPublisherId;
    this.nextPublisherId += 1;
    let nextGeneration = 1;
    const own = <T extends RegisteredMediaFile>(registration: T): T => {
      if (this.disposed) {
        registration.release();
        throw new Error('Desktop HTTP resource gateway is disposed.');
      }
      const scopedOwner: DesktopHttpResourceOwner = {
        ...owner,
        generation: String(nextGeneration),
      };
      nextGeneration += 1;
      this.registrations.set(registration.token, {
        owner: scopedOwner,
        registration,
        publisherId,
      });
      return {
        ...registration,
        release: () => this.releasePublisherToken(publisherId, registration.token),
      };
    };
    return {
      registerFile: async (absolutePath, mediaType, revision) => {
        this.requireActive();
        return own(await this.mediaServer.registerFile(absolutePath, mediaType, revision));
      },
      registerPcm: async (createStream): Promise<RegisteredPcmStream> => {
        this.requireActive();
        const registration = await this.mediaServer.registerPcm(createStream);
        const owned = own(registration);
        return { ...owned, prime: registration.prime };
      },
      registerResourceSet: async (entries, entryPath): Promise<RegisteredMediaResourceSet> => {
        this.requireActive();
        const registration = await this.mediaServer.registerResourceSet(entries, entryPath);
        const owned = own(registration);
        return { ...owned, entryUrl: registration.entryUrl };
      },
      unregister: (token) => this.releasePublisherToken(publisherId, token),
    };
  }

  releaseSession(sessionId: string): void {
    this.releaseWhere((record) => record.owner.sessionId === sessionId);
  }

  releaseGeneration(
    owner: Pick<
      DesktopHttpResourceOwner,
      'windowId' | 'viewId' | 'sessionId' | 'endpointEpoch' | 'generation'
    >,
  ): void {
    assertPartialOwner(owner);
    this.releaseWhere(
      (record) =>
        record.owner.windowId === owner.windowId &&
        record.owner.viewId === owner.viewId &&
        record.owner.sessionId === owner.sessionId &&
        record.owner.endpointEpoch === owner.endpointEpoch &&
        record.owner.generation === owner.generation,
    );
  }

  releaseView(windowId: string, viewId: string): void {
    assertPartialOwner({ windowId, viewId });
    this.releaseWhere(
      (record) => record.owner.windowId === windowId && record.owner.viewId === viewId,
    );
  }

  releaseWindow(windowId: string): void {
    assertPartialOwner({ windowId });
    this.releaseWhere((record) => record.owner.windowId === windowId);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const record of [...this.registrations.values()]) record.registration.release();
    this.registrations.clear();
    await this.mediaServer.dispose();
  }

  private own(
    owner: DesktopHttpResourceOwner,
    registration: RegisteredMediaFile,
    url: string,
  ): DesktopHttpResourceLease {
    if (this.disposed) {
      registration.release();
      throw new Error('Desktop HTTP resource gateway is disposed.');
    }
    this.registrations.set(registration.token, { owner, registration });
    return {
      url,
      release: () => {
        const current = this.registrations.get(registration.token);
        if (!current) return;
        this.registrations.delete(registration.token);
        current.registration.release();
      },
    };
  }

  private releaseWhere(predicate: (record: OwnedRegistration) => boolean): void {
    for (const [token, record] of this.registrations) {
      if (!predicate(record)) continue;
      this.registrations.delete(token);
      record.registration.release();
    }
  }

  private releasePublisherToken(publisherId: number, token: string): void {
    const record = this.registrations.get(token);
    if (!record) return;
    if (record.publisherId !== publisherId) {
      throw new Error('Desktop HTTP media publisher cannot release another owner registration.');
    }
    this.registrations.delete(token);
    record.registration.release();
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop HTTP resource gateway is disposed.');
  }
}

function assertOwner(owner: DesktopHttpResourceOwner): void {
  assertPartialOwner(owner);
}

function assertPartialOwner<T extends object>(owner: T): void {
  for (const [label, value] of Object.entries(owner)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Desktop HTTP resource owner ${label} is required.`);
    }
  }
}
