import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { OpenTab } from '@neko/agent-contracts';
import {
  createTabRenderRuntimeRegistry,
  type TabRenderRuntimeRegistry,
} from './tab-render-runtime';
import { useOptionalAgentHostRuntimeAdapter } from '../host-runtime-context';
import {
  createTabRenderRealmStateCoordinator,
  type TabRenderRealmStateHost,
  type TabRenderRealmStateCoordinator,
} from './tab-render-realm-state';

interface RegistryRootLease {
  active: boolean;
}

export function useTabRenderRuntimeRegistry(
  openTabs: readonly OpenTab[],
  activeTabId: string | null,
  host?: TabRenderRealmStateHost,
): TabRenderRuntimeRegistry {
  const injectedHost = useOptionalAgentHostRuntimeAdapter();
  const resolvedHost = host ?? injectedHost;
  if (!resolvedHost) {
    throw new Error('Tab render runtime registry requires an injected Agent host runtime adapter.');
  }
  const registryRef = useRef<TabRenderRuntimeRegistry>();
  const rootLeaseRef = useRef<RegistryRootLease>();
  const realmStateRef = useRef<TabRenderRealmStateCoordinator>();
  const [, publishReconciliation] = useReducer((revision: number) => revision + 1, 0);
  registryRef.current ??= createTabRenderRuntimeRegistry();
  const registry = registryRef.current;
  realmStateRef.current ??= createTabRenderRealmStateCoordinator(resolvedHost, registry);
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
    const lease: RegistryRootLease = { active: true };
    rootLeaseRef.current = lease;
    const handlePageHide = (): void => realmState.flush();
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      lease.active = false;
      queueMicrotask(() => {
        if (!lease.active && rootLeaseRef.current === lease) {
          realmState.dispose();
          registry.dispose();
        }
      });
    };
  }, [realmState, registry]);

  return registry;
}
