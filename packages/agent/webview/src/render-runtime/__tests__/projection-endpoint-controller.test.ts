import { describe, expect, it } from 'vitest';
import type {
  AgentHostRuntimeAdapter,
  AgentHostToWebviewMessage,
  ProjectionAttachmentKey,
  AgentWebviewToHostMessage,
} from '@neko/agent-contracts';
import {
  createProjectionEndpointController,
  type ProjectionEndpointControllerErrorContext,
} from '../projection-endpoint-controller';
import { createTabRenderRuntimeRegistry } from '../tab-render-runtime';

function createHost() {
  const sent: AgentWebviewToHostMessage[] = [];
  const events: string[] = [];
  let listener: ((message: AgentHostToWebviewMessage) => void) | null = null;
  const host: AgentHostRuntimeAdapter = {
    hostKind: 'electron',
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
    emit(message: AgentHostToWebviewMessage) {
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

function attachMessages(sent: readonly AgentWebviewToHostMessage[]) {
  return sent.filter(
    (message): message is Extract<AgentWebviewToHostMessage, { type: 'projectionAttach' }> =>
      message.type === 'projectionAttach',
  );
}

function snapshotFrame(key: ProjectionAttachmentKey): AgentHostToWebviewMessage {
  return {
    type: 'projectionSnapshot',
    key,
    sequence: 0,
    projection: { conversationId: key.conversationId, turns: [] },
  };
}

describe('ProjectionEndpointController', () => {
  it('subscribes before explicit endpoint discovery', () => {
    const { host } = createHarness([]);

    expect(host.events.slice(0, 2)).toEqual(['subscribe', 'send:projectionEndpointDiscover']);
    expect(host.sent[0]).toEqual({
      type: 'projectionEndpointDiscover',
      realmId: 'realm-1',
    });
  });

  it('attaches every retained Tab independently and ignores visibility-only switching', () => {
    const { host, registry, controller, bindings } = createHarness();

    host.emit({
      type: 'projectionEndpointReady',
      realmId: 'realm-1',
    });
    const initialAttachments = attachMessages(host.sent);
    expect(initialAttachments).toHaveLength(2);
    expect(new Set(initialAttachments.map((message) => message.key.attachmentId)).size).toBe(2);

    registry.reconcile(bindings, 'tab-b');
    controller.reconcile(bindings);
    host.emit({
      type: 'projectionEndpointReady',
      realmId: 'realm-1',
    });

    expect(attachMessages(host.sent)).toHaveLength(2);
    expect(host.sent.filter((message) => message.type === 'projectionDetach')).toHaveLength(0);
  });

  it('ignores an endpoint announcement owned by a replaced Webview realm', () => {
    const { host } = createHarness([{ tabId: 'tab-a', conversationId: 'conv-a' }]);

    host.emit({
      type: 'projectionEndpointReady',
      realmId: 'replaced-realm',
    });

    expect(attachMessages(host.sent)).toHaveLength(0);
  });

  it('routes authoritative frames to hidden Tab replicas', () => {
    const { host, registry } = createHarness();
    host.emit({
      type: 'projectionEndpointReady',
      realmId: 'realm-1',
    });
    const hiddenKey = attachMessages(host.sent).find(
      (message) => message.key.tabId === 'tab-b',
    )?.key;
    if (!hiddenKey) throw new Error('Missing hidden Tab attachment.');

    host.emit(snapshotFrame(hiddenKey));

    expect(registry.require('tab-b').store.getSnapshot().visibility).toBe('hidden');
    expect(registry.require('tab-b').projectionReplica.getSnapshot().projection).toMatchObject({
      conversationId: 'conv-b',
    });
    expect(host.sent).toContainEqual({
      type: 'projectionSnapshotAck',
      key: hiddenKey,
      sequence: 0,
    });
  });

  it('treats duplicate readiness for one connection as idempotent', () => {
    const { host, registry } = createHarness([{ tabId: 'tab-a', conversationId: 'conv-a' }]);
    host.emit({
      type: 'projectionEndpointReady',
      realmId: 'realm-1',
    });
    const oldKey = attachMessages(host.sent)[0]?.key;
    if (!oldKey) throw new Error('Missing old attachment.');
    host.emit(snapshotFrame(oldKey));

    host.emit({
      type: 'projectionEndpointReady',
      realmId: 'realm-1',
    });
    expect(attachMessages(host.sent)).toHaveLength(1);
    expect(host.sent.filter((message) => message.type === 'projectionDetach')).toEqual([]);
    expect(registry.require('tab-a').projectionReplica.getSnapshot().projection).toMatchObject({
      conversationId: 'conv-a',
    });
  });

  it('reattaches a retained Tab when a replacement controller owns the next Host endpoint', () => {
    const bindings = [{ tabId: 'tab-a', conversationId: 'conv-a' }];
    const registry = createTabRenderRuntimeRegistry();
    registry.reconcile(bindings, 'tab-a');
    const firstHost = createHost();
    const firstController = createProjectionEndpointController({
      registry,
      host: firstHost.host,
      realmId: 'realm-1',
      createAttachmentId: () => 'attachment-1',
      reportError: () => undefined,
    });
    firstController.reconcile(bindings);
    firstController.start();
    firstHost.emit({
      type: 'projectionEndpointReady',
      realmId: 'realm-1',
    });
    const oldKey = attachMessages(firstHost.sent)[0]?.key;
    if (!oldKey) throw new Error('Missing initial attachment.');
    firstController.stop();

    const replacementHost = createHost();
    const replacementController = createProjectionEndpointController({
      registry,
      host: replacementHost.host,
      realmId: 'realm-2',
      createAttachmentId: () => 'attachment-2',
      reportError: () => undefined,
    });
    replacementController.reconcile(bindings);
    replacementController.start();

    expect(() =>
      replacementHost.emit({
        type: 'projectionEndpointReady',
        realmId: 'realm-2',
      }),
    ).not.toThrow();
    expect(firstHost.sent.at(-1)).toEqual({
      type: 'projectionDetach',
      key: oldKey,
      reason: 'endpoint-replaced',
    });
    expect(attachMessages(replacementHost.sent).at(-1)?.key).toEqual({
      attachmentId: 'attachment-2',
      tabId: 'tab-a',
      conversationId: 'conv-a',
    });
  });

  it('recovers a fatal live gap with a new attachment and a fresh snapshot boundary', async () => {
    const { host, registry, errors } = createHarness([
      { tabId: 'tab-a', conversationId: 'conv-a' },
    ]);
    host.emit({
      type: 'projectionEndpointReady',
      realmId: 'realm-1',
    });
    const oldKey = attachMessages(host.sent)[0]?.key;
    if (!oldKey) throw new Error('Missing initial attachment.');
    host.emit(snapshotFrame(oldKey));

    host.emit({
      type: 'projectionPatch',
      key: oldKey,
      sequence: 2,
      patch: {
        type: 'conversationProjectionPatch',
        conversationId: 'conv-a',
        turnId: 'turn-a',

        runId: 'run-a',
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
    expect(registry.require('tab-a').projectionReplica.getSnapshot().projection?.turns).toEqual([]);
    expect(registry.require('tab-a').projectionAttachment?.getSnapshot().phase).toBe(
      'awaiting-snapshot',
    );
  });

  it('closing one Tab detaches only its attachment', () => {
    const { host, registry, controller, errors } = createHarness();
    host.emit({
      type: 'projectionEndpointReady',
      realmId: 'realm-1',
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

    host.emit(snapshotFrame(closedKey));
    host.emit({ type: 'projectionDetach', key: closedKey, reason: 'tab-closed' });
    expect(errors).toEqual([]);
  });

  it('keeps never-owned projection frames fail-visible', () => {
    const { host, errors } = createHarness([]);
    const foreignKey = {
      attachmentId: 'foreign-attachment',
      tabId: 'foreign-tab',
      conversationId: 'foreign-conversation',
    };

    host.emit(snapshotFrame(foreignKey));

    expect(errors).toHaveLength(1);
    expect(errors[0]?.error.message).toBe(
      'Projection frame targets unknown Tab binding foreign-tab.',
    );
  });
});
