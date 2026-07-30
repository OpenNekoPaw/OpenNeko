import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { OpenTab } from '@neko-agent/types';
import {
  createTabRenderRuntimeRegistry,
  type TabRenderRuntimeRegistry,
} from './tab-render-runtime';
import { getAgentHostRuntimeAdapter } from '@/messages';
import {
  createTabRenderRealmStateCoordinator,
  type TabRenderRealmStateHost,
  type TabRenderRealmStateCoordinator,
} from './tab-render-realm-state';

interface RegistryRootLease {
  generation: number;
  active: boolean;
}

export function useTabRenderRuntimeRegistry(
  openTabs: readonly OpenTab[],
  activeTabId: string | null,
  host: TabRenderRealmStateHost = getAgentHostRuntimeAdapter(),
): TabRenderRuntimeRegistry {
  const registryRef = useRef<TabRenderRuntimeRegistry>();
  const rootLeaseRef = useRef<RegistryRootLease>({ generation: 0, active: false });
  const realmStateRef = useRef<TabRenderRealmStateCoordinator>();
  const [, publishReconciliation] = useReducer((revision: number) => revision + 1, 0);
  registryRef.current ??= createTabRenderRuntimeRegistry();
  const registry = registryRef.current;
  realmStateRef.current ??= createTabRenderRealmStateCoordinator(host, registry);
  const realmState = realmStateRef.current;

  useLayoutEffect(() => {
    const runtimeChanged = registry.reconcile(
      openTabs.map((tab) => ({ tabId: tab.id, conversationId: tab.conversationId })),
      activeTabId,
    );
    const draftRestored = realmState.reconcile(
      openTabs.map((tab) => ({ tabId: tab.id, conversationId: tab.conversationId })),
    );
    if (runtimeChanged || draftRestored) publishReconciliation();
  }, [activeTabId, openTabs, realmState, registry]);

  useEffect(() => {
    const lease = rootLeaseRef.current;
    const generation = lease.generation + 1;
    lease.generation = generation;
    lease.active = true;
    const handlePageHide = (): void => realmState.flush();
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      lease.active = false;
      queueMicrotask(() => {
        if (!lease.active && lease.generation === generation) {
          realmState.dispose();
          registry.dispose();
        }
      });
    };
  }, [realmState, registry]);

  return registry;
}
