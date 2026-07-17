import { describe, expect, it } from 'vitest';
import type {
  AgentHostRuntimeAdapter,
  ExtensionToWebviewMessage,
  ProjectionAttachmentKey,
  WebviewToExtensionMessage,
} from '@neko-agent/types';
import {
  createProjectionEndpointController,
  type ProjectionEndpointControllerErrorContext,
} from '../projection-endpoint-controller';
import { createTabRenderRuntimeRegistry } from '../tab-render-runtime';

function createHost() {
  const sent: WebviewToExtensionMessage[] = [];
  const events: string[] = [];
  let listener: ((message: ExtensionToWebviewMessage) => void) | null = null;
  const host: AgentHostRuntimeAdapter = {
    hostKind: 'vscode',
    runtimeId: 'test-runtime',
    send(message) {
      events.push(`send:${message.type}`);
      sent.push(message);
    },
    subscribe(next) {
      events.push('subscribe');
      listener = next;
      return {
        dispose() {
          events.push('unsubscribe');
          listener = null;
        },
      };
    },
    getState() {
      return undefined;
    },
    setState() {},
  };
  return {
    host,
    sent,
    events,
    emit(message: ExtensionToWebviewMessage) {
      if (!listener) throw new Error('Host listener is not subscribed.');
      listener(message);
    },
  };
}

function createHarness(
  bindings = [
    { tabId: 'tab-a', conversationId: 'conv-a' },
    { tabId: 'tab-b', conversationId: 'conv-b' },
  ],
) {
  const registry = createTabRenderRuntimeRegistry();
  registry.reconcile(bindings, bindings[0]?.tabId ?? null);
  const host = createHost();
  let nextAttachment = 0;
  const errors: Array<{ error: Error; context: ProjectionEndpointControllerErrorContext }> = [];
  const controller = createProjectionEndpointController({
    registry,
    host: host.host,
    realmId: 'realm-1',
    createAttachmentId: (tabId) => `${tabId}-attachment-${++nextAttachment}`,
    reportError: (error, context) => errors.push({ error, context }),
  });
  controller.reconcile(bindings);
  controller.start();
  return { registry, host, controller, errors, bindings };
}

function attachMessages(sent: readonly WebviewToExtensionMessage[]) {
  return sent.filter(
    (message): message is Extract<WebviewToExtensionMessage, { type: 'projectionAttach' }> =>
      message.type === 'projectionAttach',
  );
}

function snapshotFrame(key: ProjectionAttachmentKey, version = 0): ExtensionToWebviewMessage {
  return {
    type: 'projectionSnapshot',
    key,
    sequence: 0,
    projectionVersion: version,
    projection: { conversationId: key.conversationId, projectionVersion: version, turns: [] },
  };
}

describe('ProjectionEndpointController', () => {
  it('subscribes before explicit endpoint discovery', () => {
    const { host } = createHarness([]);

    expect(host.events.slice(0, 2)).toEqual(['subscribe', 'send:projectionEndpointDiscover']);
    expect(host.sent[0]).toEqual({
      type: 'projectionEndpointDiscover',
      protocolVersion: 1,
      realmId: 'realm-1',
    });
  });

  it('attaches every retained Tab independently and ignores visibility-only switching', () => {
    const { host, registry, controller, bindings } = createHarness();

    host.emit({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'realm-1',
      endpointEpoch: 'endpoint-1',
    });
    const initialAttachments = attachMessages(host.sent);
    expect(initialAttachments).toHaveLength(2);
    expect(new Set(initialAttachments.map((message) => message.key.attachmentId)).size).toBe(2);

    registry.reconcile(bindings, 'tab-b');
    controller.reconcile(bindings);
    host.emit({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'realm-1',
      endpointEpoch: 'endpoint-1',
    });

    expect(attachMessages(host.sent)).toHaveLength(2);
    expect(host.sent.filter((message) => message.type === 'projectionDetach')).toHaveLength(0);
  });

  it('ignores an endpoint announcement owned by a replaced Webview realm', () => {
    const { host } = createHarness([{ tabId: 'tab-a', conversationId: 'conv-a' }]);

    host.emit({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'replaced-realm',
      endpointEpoch: 'stale-endpoint',
    });

    expect(attachMessages(host.sent)).toHaveLength(0);
  });

  it('routes authoritative frames to hidden Tab replicas', () => {
    const { host, registry } = createHarness();
    host.emit({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'realm-1',
      endpointEpoch: 'endpoint-1',
    });
    const hiddenKey = attachMessages(host.sent).find(
      (message) => message.key.tabId === 'tab-b',
    )?.key;
    if (!hiddenKey) throw new Error('Missing hidden Tab attachment.');

    host.emit(snapshotFrame(hiddenKey, 3));

    expect(registry.require('tab-b').store.getSnapshot().visibility).toBe('hidden');
    expect(registry.require('tab-b').projectionReplica.getSnapshot().projection).toMatchObject({
      conversationId: 'conv-b',
      projectionVersion: 3,
    });
    expect(host.sent).toContainEqual({
      type: 'projectionSnapshotAck',
      key: hiddenKey,
      sequence: 0,
      projectionVersion: 3,
    });
  });

  it('abandons old endpoint attachments locally and reattaches retained replicas', () => {
    const { host, registry, errors } = createHarness([
      { tabId: 'tab-a', conversationId: 'conv-a' },
    ]);
    host.emit({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'realm-1',
      endpointEpoch: 'endpoint-1',
    });
    const oldKey = attachMessages(host.sent)[0]?.key;
    if (!oldKey) throw new Error('Missing old attachment.');
    host.emit(snapshotFrame(oldKey, 2));

    host.emit({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'realm-1',
      endpointEpoch: 'endpoint-2',
    });
    const attachments = attachMessages(host.sent);
    const newKey = attachments[1]?.key;
    if (!newKey) throw new Error('Missing replacement attachment.');

    expect(newKey.endpointEpoch).toBe('endpoint-2');
    expect(newKey.attachmentId).not.toBe(oldKey.attachmentId);
    expect(
      host.sent.filter(
        (message) =>
          message.type === 'projectionDetach' && message.key.endpointEpoch === 'endpoint-1',
      ),
    ).toEqual([]);
    expect(
      registry.require('tab-a').projectionReplica.getSnapshot().projection?.projectionVersion,
    ).toBe(2);

    host.emit(snapshotFrame(oldKey, 9));
    expect(errors.at(-1)?.context.operation).toBe('route-frame');
    expect(
      registry.require('tab-a').projectionReplica.getSnapshot().projection?.projectionVersion,
    ).toBe(2);

    host.emit(snapshotFrame(newKey, 4));
    expect(
      registry.require('tab-a').projectionReplica.getSnapshot().projection?.projectionVersion,
    ).toBe(4);
  });

  it('recovers a fatal live gap with a new attachment and a fresh snapshot boundary', async () => {
    const { host, registry, errors } = createHarness([
      { tabId: 'tab-a', conversationId: 'conv-a' },
    ]);
    host.emit({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'realm-1',
      endpointEpoch: 'endpoint-1',
    });
    const oldKey = attachMessages(host.sent)[0]?.key;
    if (!oldKey) throw new Error('Missing initial attachment.');
    host.emit(snapshotFrame(oldKey));

    host.emit({
      type: 'projectionPatch',
      key: oldKey,
      sequence: 2,
      baseProjectionVersion: 0,
      projectionVersion: 1,
      patch: {
        type: 'conversationProjectionPatch',
        conversationId: 'conv-a',
        baseProjectionVersion: 0,
        projectionVersion: 1,
        turnId: 'turn-a',
        messageId: 'message-a',
        operations: [],
      },
    });
    await Promise.resolve();

    expect(errors.at(-1)?.context.operation).toBe('attachment-fatal');
    expect(errors.at(-1)?.error).toMatchObject({
      name: 'ProjectionAttachmentClientProtocolError',
      code: 'attachment-frame-gap',
    });
    expect(host.sent).toContainEqual({
      type: 'projectionDetach',
      key: oldKey,
      reason: 'protocol-fatal',
    });
    const newKey = attachMessages(host.sent)[1]?.key;
    if (!newKey) throw new Error('Missing recovery attachment.');
    expect(newKey.attachmentId).not.toBe(oldKey.attachmentId);
    expect(
      registry.require('tab-a').projectionReplica.getSnapshot().projection?.projectionVersion,
    ).toBe(0);
    expect(registry.require('tab-a').projectionAttachment?.getSnapshot().phase).toBe(
      'awaiting-snapshot',
    );
  });

  it('closing one Tab detaches only its attachment', () => {
    const { host, registry, controller } = createHarness();
    host.emit({
      type: 'projectionEndpointReady',
      protocolVersion: 1,
      realmId: 'realm-1',
      endpointEpoch: 'endpoint-1',
    });
    const closedKey = attachMessages(host.sent).find(
      (message) => message.key.tabId === 'tab-a',
    )?.key;
    if (!closedKey) throw new Error('Missing closed Tab attachment.');

    const retained = [{ tabId: 'tab-b', conversationId: 'conv-b' }];
    registry.reconcile(retained, 'tab-b');
    controller.reconcile(retained);

    expect(host.sent).toContainEqual({
      type: 'projectionDetach',
      key: closedKey,
      reason: 'tab-closed',
    });
    expect(registry.require('tab-b').projectionAttachment?.getSnapshot().phase).toBe(
      'awaiting-snapshot',
    );
  });
});
