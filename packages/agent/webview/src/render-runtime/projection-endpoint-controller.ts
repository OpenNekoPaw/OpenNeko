import type {
  AgentHostRuntimeAdapter,
  ConversationProjectionAttachmentHostFrame,
  AgentHostToWebviewMessage,
  ProjectionAttachmentKey,
} from '@neko/agent-contracts';
import { isSameProjectionAttachment } from '@neko/agent-contracts';
import type {
  TabProjectionAttachmentBinding,
  TabRenderBinding,
  TabRenderRuntime,
  TabRenderRuntimeRegistry,
} from './tab-render-runtime';

export interface ProjectionEndpointControllerErrorContext {
  readonly operation: 'drop-stale-frame' | 'route-frame' | 'attachment-fatal';
  readonly key: ProjectionAttachmentKey;
}

export interface ProjectionEndpointControllerOptions {
  readonly registry: TabRenderRuntimeRegistry;
  readonly host: AgentHostRuntimeAdapter;
  readonly realmId: string;
  readonly createAttachmentId: (tabId: string) => string;
  readonly reportError: (error: Error, context: ProjectionEndpointControllerErrorContext) => void;
}

export interface ProjectionEndpointController {
  start(): void;
  stop(): void;
  reconcile(bindings: readonly TabRenderBinding[]): void;
}

export function createProjectionEndpointController(
  options: ProjectionEndpointControllerOptions,
): ProjectionEndpointController {
  return new DefaultProjectionEndpointController(options);
}

export function createProjectionAttachmentId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Projection attachments require crypto.randomUUID().');
  }
  return globalThis.crypto.randomUUID();
}

class DefaultProjectionEndpointController implements ProjectionEndpointController {
  private readonly bindings = new Map<string, TabRenderBinding>();
  private readonly ownedKeys = new Map<string, ProjectionAttachmentKey>();
  private readonly recoveryKeys = new Set<string>();
  private endpointReady = false;
  private subscription: { dispose(): void } | null = null;

  constructor(private readonly options: ProjectionEndpointControllerOptions) {}

  start(): void {
    if (this.subscription) return;
    this.subscription = this.options.host.subscribe((message) => this.acceptHostMessage(message));
    this.options.host.send({
      type: 'projectionEndpointDiscover',
      realmId: this.options.realmId,
    });
  }

  stop(): void {
    this.subscription?.dispose();
    this.subscription = null;
  }

  reconcile(bindings: readonly TabRenderBinding[]): void {
    const next = new Map<string, TabRenderBinding>();
    for (const binding of bindings) {
      assertBinding(binding);
      if (next.has(binding.tabId)) {
        throw new Error(`Duplicate projection Tab binding ${binding.tabId}.`);
      }
      const runtime = this.options.registry.require(binding.tabId);
      if (runtime.conversationId !== binding.conversationId) {
        throw new Error(
          `Projection Tab ${binding.tabId} owner mismatch: runtime=${runtime.conversationId}, binding=${binding.conversationId}.`,
        );
      }
      next.set(binding.tabId, binding);
    }
    for (const tabId of this.bindings.keys()) {
      if (!next.has(tabId)) this.releaseOwnedKey(tabId);
    }
    this.bindings.clear();
    for (const [tabId, binding] of next) this.bindings.set(tabId, binding);

    if (!this.endpointReady) return;
    for (const binding of this.bindings.values()) {
      const runtime = this.options.registry.require(binding.tabId);
      if (!runtime.projectionAttachment) {
        this.attach(runtime);
      }
    }
  }

  private acceptHostMessage(message: AgentHostToWebviewMessage): void {
    if (message.type === 'projectionEndpointReady') {
      if (message.realmId !== this.options.realmId) return;
      this.acceptEndpointReady();
      return;
    }
    if (
      message.type === 'projectionSnapshot' ||
      message.type === 'projectionPatch' ||
      message.type === 'projectionDetach' ||
      message.type === 'projectionProtocolDiagnostic'
    ) {
      this.routeFrame(message);
    }
  }

  private acceptEndpointReady(): void {
    if (this.endpointReady) {
      for (const binding of this.bindings.values()) {
        const runtime = this.options.registry.require(binding.tabId);
        if (!runtime.projectionAttachment) this.attach(runtime);
      }
      return;
    }

    this.endpointReady = true;
    for (const binding of this.bindings.values()) {
      const runtime = this.options.registry.require(binding.tabId);
      if (runtime.projectionAttachment) {
        runtime.reattachProjection(this.createBinding(runtime), 'endpoint-replaced');
      } else {
        this.attach(runtime);
      }
    }
  }

  private routeFrame(frame: ConversationProjectionAttachmentHostFrame): void {
    const runtime = this.options.registry.get(frame.key.tabId);
    const binding = this.bindings.get(frame.key.tabId);
    if (!runtime || !binding || binding.conversationId !== frame.key.conversationId) {
      this.options.reportError(
        new Error(`Projection frame targets unknown Tab binding ${frame.key.tabId}.`),
        { operation: 'route-frame', key: frame.key },
      );
      return;
    }
    const activeKey = runtime.projectionAttachment?.getSnapshot().key;
    if (!activeKey || !isSameProjectionAttachment(activeKey, frame.key)) {
      this.options.reportError(
        new Error(
          `Dropped stale projection frame for Tab ${frame.key.tabId} attachment ${frame.key.attachmentId}.`,
        ),
        { operation: 'drop-stale-frame', key: frame.key },
      );
      return;
    }

    try {
      runtime.acceptProjectionFrame(frame);
    } catch (error: unknown) {
      if (runtime.projectionAttachment?.getSnapshot().phase !== 'fatal') {
        this.options.reportError(toError(error), { operation: 'route-frame', key: frame.key });
      }
    }
  }

  private attach(runtime: TabRenderRuntime): void {
    runtime.attachProjection(this.createBinding(runtime));
  }

  private createBinding(runtime: TabRenderRuntime): TabProjectionAttachmentBinding {
    this.releaseOwnedKey(runtime.tabId);
    const key = {
      attachmentId: this.options.createAttachmentId(runtime.tabId),
      tabId: runtime.tabId,
      conversationId: runtime.conversationId,
    };
    this.ownedKeys.set(runtime.tabId, key);
    return {
      attachmentId: key.attachmentId,
      send: (message) => this.options.host.send(message),
      reportError: (error, key) => this.handleAttachmentFatal(runtime.tabId, error, key),
    };
  }

  private releaseOwnedKey(tabId: string): void {
    this.ownedKeys.delete(tabId);
  }

  private handleAttachmentFatal(tabId: string, error: Error, key: ProjectionAttachmentKey): void {
    this.options.reportError(error, { operation: 'attachment-fatal', key });
    const recoveryKey = formatKey(key);
    if (this.recoveryKeys.has(recoveryKey)) return;
    this.recoveryKeys.add(recoveryKey);
    queueMicrotask(() => {
      this.recoveryKeys.delete(recoveryKey);
      if (!this.subscription || !this.endpointReady) return;
      const runtime = this.options.registry.get(tabId);
      const binding = this.bindings.get(tabId);
      const activeKey = runtime?.projectionAttachment?.getSnapshot().key;
      if (!runtime || !binding || !activeKey || !isSameProjectionAttachment(activeKey, key)) return;
      if (runtime.projectionAttachment?.getSnapshot().phase !== 'fatal') return;
      runtime.reattachProjection(this.createBinding(runtime), 'protocol-fatal');
    });
  }
}

function assertBinding(binding: TabRenderBinding): void {
  assertIdentity('tabId', binding.tabId);
  assertIdentity('conversationId', binding.conversationId);
}

function assertIdentity(name: string, value: string): void {
  if (value.trim().length === 0) throw new Error(`Projection endpoint ${name} is required.`);
}

function formatKey(key: ProjectionAttachmentKey): string {
  return `${key.attachmentId}:${key.tabId}:${key.conversationId}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
