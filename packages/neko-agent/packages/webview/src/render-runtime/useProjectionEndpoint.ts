import { useLayoutEffect, useMemo } from 'react';
import { buildAgentSessionDiagnosticMessage, type OpenTab } from '@neko-agent/types';
import { useAgentHostRuntimeAdapter } from '@/host-runtime-context';
import { getLogger } from '@/utils/logger';
import {
  createProjectionAttachmentId,
  createProjectionEndpointController,
} from './projection-endpoint-controller';
import type { TabRenderRuntimeRegistry } from './tab-render-runtime';

const logger = getLogger('ProjectionEndpoint');

function createProjectionRealmId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Projection endpoint discovery requires crypto.randomUUID().');
  }
  return globalThis.crypto.randomUUID();
}

export function useProjectionEndpoint(
  registry: TabRenderRuntimeRegistry,
  openTabs: readonly OpenTab[],
): void {
  const host = useAgentHostRuntimeAdapter();
  const realmId = useMemo(() => createProjectionRealmId(), []);
  const controller = useMemo(
    () =>
      createProjectionEndpointController({
        registry,
        host,
        realmId,
        createAttachmentId: () => createProjectionAttachmentId(),
        reportError: (error, context) => {
          logger.error(error.message, {
            operation: context.operation,
            endpointEpoch: context.key.endpointEpoch,
            attachmentId: context.key.attachmentId,
            tabId: context.key.tabId,
            conversationId: context.key.conversationId,
          });
          const runtime = registry.get(context.key.tabId);
          if (!runtime) return;
          const diagnostic = buildAgentSessionDiagnosticMessage({
            code: 'projection-attachment-protocol-fatal',
            message: error.message,
            action: context.operation,
            conversationId: context.key.conversationId,
            tabId: context.key.tabId,
          });
          runtime.store.updateState((state) => ({
            diagnostics: [...state.diagnostics, diagnostic],
          }));
        },
      }),
    [host, realmId, registry],
  );
  const bindings = useMemo(
    () => openTabs.map((tab) => ({ tabId: tab.id, conversationId: tab.conversationId })),
    [openTabs],
  );

  useLayoutEffect(() => {
    controller.reconcile(bindings);
  }, [bindings, controller]);

  useLayoutEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
}
