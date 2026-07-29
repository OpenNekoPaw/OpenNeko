import type {
  AgentHostRuntimeAdapter,
  ConversationProjectionAttachmentHostFrame,
  ExtensionToWebviewMessage,
  ProjectionAttachmentKey,
} from '@neko-agent/types';
import { AGENT_WEBVIEW_PROTOCOL_VERSION, isSameProjectionAttachment } from '@neko-agent/types';
import type {
  TabProjectionAttachmentBinding,
  TabRenderBinding,
  TabRenderRuntime,
  TabRenderRuntimeRegistry,
} from './tab-render-runtime';

export interface ProjectionEndpointControllerErrorContext {
  readonly operation: 'route-frame' | 'attachment-fatal';
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
  private readonly recoveryKeys = new Set<string>();
  private endpointEpoch: string | null = null;
  private subscription: { dispose(): void } | null = null;

  constructor(private readonly options: ProjectionEndpointControllerOptions) {}

  start(): void {
    if (this.subscription) return;
    this.subscription = this.options.host.subscribe((message) => this.acceptHostMessage(message));
    this.options.host.send({
      type: 'projectionEndpointDiscover',
      protocolVersion: AGENT_WEBVIEW_PROTOCOL_VERSION,
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
    this.bindings.clear();
    for (const [tabId, binding] of next) this.bindings.set(tabId, binding);

    if (!this.endpointEpoch) return;
    for (const binding of this.bindings.values()) {
      const runtime = this.options.registry.require(binding.tabId);
      if (!runtime.projectionAttachment) {
        this.attach(runtime, this.endpointEpoch);
      }
    }
  }

  private acceptHostMessage(message: ExtensionToWebviewMessage): void {
    if (message.type === 'projectionEndpointReady') {
      if (message.protocolVersion !== AGENT_WEBVIEW_PROTOCOL_VERSION) {
        throw new Error(
          `Agent Webview protocol mismatch: expected ${AGENT_WEBVIEW_PROTOCOL_VERSION}, received ${message.protocolVersion}.`,
        );
      }
      if (message.realmId !== this.options.realmId) return;
      this.acceptEndpoint(message.endpointEpoch);
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

  private acceptEndpoint(endpointEpoch: string): void {
    assertIdentity('endpointEpoch', endpointEpoch);
    if (endpointEpoch === this.endpointEpoch) {
      for (const binding of this.bindings.values()) {
        const runtime = this.options.registry.require(binding.tabId);
        if (!runtime.projectionAttachment) this.attach(runtime, endpointEpoch);
      }
      return;
    }

    const replacesEndpoint = this.endpointEpoch !== null;
    this.endpointEpoch = endpointEpoch;
    for (const binding of this.bindings.values()) {
      const runtime = this.options.registry.require(binding.tabId);
      if (replacesEndpoint && runtime.projectionAttachment) {
        runtime.reattachProjection(this.createBinding(runtime, endpointEpoch), 'endpoint-replaced');
      } else {
        this.attach(runtime, endpointEpoch);
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
          `Rejected stale projection frame for Tab ${frame.key.tabId} attachment ${frame.key.attachmentId}.`,
        ),
        { operation: 'route-frame', key: frame.key },
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

  private attach(runtime: TabRenderRuntime, endpointEpoch: string): void {
    runtime.attachProjection(this.createBinding(runtime, endpointEpoch));
  }

  private createBinding(
    runtime: TabRenderRuntime,
    endpointEpoch: string,
  ): TabProjectionAttachmentBinding {
    return {
      endpointEpoch,
      attachmentId: this.options.createAttachmentId(runtime.tabId),
      send: (message) => this.options.host.send(message),
      reportError: (error, key) => this.handleAttachmentFatal(runtime.tabId, error, key),
    };
  }

  private handleAttachmentFatal(tabId: string, error: Error, key: ProjectionAttachmentKey): void {
    this.options.reportError(error, { operation: 'attachment-fatal', key });
    const recoveryKey = formatKey(key);
    if (this.recoveryKeys.has(recoveryKey)) return;
    this.recoveryKeys.add(recoveryKey);
    queueMicrotask(() => {
      this.recoveryKeys.delete(recoveryKey);
      if (!this.subscription || this.endpointEpoch !== key.endpointEpoch) return;
      const runtime = this.options.registry.get(tabId);
      const binding = this.bindings.get(tabId);
      const activeKey = runtime?.projectionAttachment?.getSnapshot().key;
      if (!runtime || !binding || !activeKey || !isSameProjectionAttachment(activeKey, key)) return;
      if (runtime.projectionAttachment?.getSnapshot().phase !== 'fatal') return;
      runtime.reattachProjection(this.createBinding(runtime, key.endpointEpoch), 'protocol-fatal');
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
  return `${key.endpointEpoch}:${key.attachmentId}:${key.tabId}:${key.conversationId}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
