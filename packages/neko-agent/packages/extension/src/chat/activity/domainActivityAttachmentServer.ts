import type {
  DomainActivityAcknowledgement,
  DomainActivityAttachRequest,
  DomainActivityAttachmentKey,
  DomainActivityDetachRequest,
  DomainActivityHostMessage,
  DomainJobCommandRequest,
} from '@neko-agent/types';
import type {
  DomainActivityCommandExecutor,
  DomainActivityPatch,
  DomainActivitySource,
} from '@neko/shared/domain-activity';

export interface DomainActivityAttachmentServer {
  attach(request: DomainActivityAttachRequest): Promise<void>;
  acknowledge(message: DomainActivityAcknowledgement): Promise<void>;
  detach(message: DomainActivityDetachRequest): Promise<void>;
  executeCommand(message: DomainJobCommandRequest): Promise<void>;
  dispose(): Promise<void>;
}

export function createDomainActivityAttachmentServer(options: {
  readonly source: DomainActivitySource;
  readonly commands: DomainActivityCommandExecutor;
  readonly postMessage: (message: DomainActivityHostMessage) => Promise<boolean>;
  readonly reportError: (error: Error) => void;
}): DomainActivityAttachmentServer {
  let attachment: DomainActivityAttachment | undefined;
  let disposed = false;

  return Object.freeze({
    async attach(request: DomainActivityAttachRequest): Promise<void> {
      assertAvailable(disposed);
      assertKey(request.key);
      const previous = attachment;
      attachment = undefined;
      await previous?.close();
      const next = new DomainActivityAttachment(request.key, options);
      attachment = next;
      try {
        await next.start();
      } catch (error) {
        if (attachment === next) attachment = undefined;
        await next.close();
        throw error;
      }
    },

    acknowledge(message: DomainActivityAcknowledgement): Promise<void> {
      assertAvailable(disposed);
      return requireAttachment(attachment, message.key).acknowledge(message);
    },

    async detach(message: DomainActivityDetachRequest): Promise<void> {
      assertAvailable(disposed);
      const current = requireAttachment(attachment, message.key);
      attachment = undefined;
      await current.close();
    },

    async executeCommand(message: DomainJobCommandRequest): Promise<void> {
      assertAvailable(disposed);
      try {
        const item = await options.commands.execute(message);
        await options.postMessage({
          type: 'domainJobCommandResult',
          requestId: message.requestId,
          success: true,
          item,
        });
      } catch (error) {
        await options.postMessage({
          type: 'domainJobCommandResult',
          requestId: message.requestId,
          success: false,
          error: toError(error).message,
        });
      }
    },

    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      const current = attachment;
      attachment = undefined;
      await current?.close();
    },
  });
}

class DomainActivityAttachment {
  private readonly patches: DomainActivityPatch[] = [];
  private iterator: AsyncIterator<DomainActivityPatch> | undefined;
  private sequence = 0;
  private deliveredVersion = -1;
  private awaitingAcknowledgement = false;
  private closed = false;

  constructor(
    readonly key: DomainActivityAttachmentKey,
    private readonly options: {
      readonly source: DomainActivitySource;
      readonly postMessage: (message: DomainActivityHostMessage) => Promise<boolean>;
      readonly reportError: (error: Error) => void;
    },
  ) {}

  async start(): Promise<void> {
    const snapshot = this.options.source.getSnapshot();
    this.iterator = this.options.source.observe(snapshot.projectionVersion)[Symbol.asyncIterator]();
    this.deliveredVersion = snapshot.projectionVersion;
    this.awaitingAcknowledgement = true;
    await this.post({
      type: 'domainActivitySnapshot',
      key: this.key,
      sequence: 0,
      snapshot,
    });
    void this.consume().catch((error: unknown) => {
      const failure = toError(error);
      this.options.reportError(failure);
      void this.fail(failure);
    });
  }

  async acknowledge(message: DomainActivityAcknowledgement): Promise<void> {
    this.assertOpen();
    if (
      !this.awaitingAcknowledgement ||
      message.sequence !== this.sequence ||
      message.projectionVersion !== this.deliveredVersion
    ) {
      throw new Error(`Domain Activity acknowledgement mismatch for ${this.key.attachmentId}.`);
    }
    this.awaitingAcknowledgement = false;
    await this.deliverNext();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.patches.length = 0;
    const iterator = this.iterator;
    this.iterator = undefined;
    await iterator?.return?.();
  }

  private async consume(): Promise<void> {
    const iterator = this.iterator;
    if (!iterator) throw new Error('Domain Activity iterator is unavailable.');
    for (;;) {
      const next = await iterator.next();
      if (next.done || this.closed) return;
      const previous = this.patches.at(-1);
      const expectedBase = previous?.projectionVersion ?? this.deliveredVersion;
      if (next.value.baseProjectionVersion !== expectedBase) {
        throw new Error(
          `Domain Activity patch base mismatch: expected ${expectedBase}, received ${next.value.baseProjectionVersion}.`,
        );
      }
      this.patches.push(next.value);
      await this.deliverNext();
    }
  }

  private async deliverNext(): Promise<void> {
    if (this.closed || this.awaitingAcknowledgement) return;
    const patch = this.patches.shift();
    if (!patch) return;
    this.sequence += 1;
    this.deliveredVersion = patch.projectionVersion;
    this.awaitingAcknowledgement = true;
    await this.post({
      type: 'domainActivityPatch',
      key: this.key,
      sequence: this.sequence,
      patch,
    });
  }

  private async fail(error: Error): Promise<void> {
    if (this.closed) return;
    await this.options.postMessage({
      type: 'domainActivityDiagnostic',
      key: this.key,
      fatal: true,
      message: error.message,
    });
    await this.close();
  }

  private async post(message: DomainActivityHostMessage): Promise<void> {
    if (!(await this.options.postMessage(message))) {
      throw new Error(`Webview rejected ${message.type}.`);
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error(`Domain Activity attachment ${this.key.attachmentId} is closed.`);
    }
  }
}

function requireAttachment(
  attachment: DomainActivityAttachment | undefined,
  key: DomainActivityAttachmentKey,
): DomainActivityAttachment {
  assertKey(key);
  if (!attachment || attachment.key.attachmentId !== key.attachmentId) {
    throw new Error(`Unknown Domain Activity attachment ${key.attachmentId}.`);
  }
  return attachment;
}

function assertKey(key: DomainActivityAttachmentKey): void {
  if (!key.attachmentId.trim()) {
    throw new Error('Domain Activity attachmentId is required.');
  }
}

function assertAvailable(disposed: boolean): void {
  if (disposed) throw new Error('Domain Activity attachment server is disposed.');
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
