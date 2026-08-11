import path from 'node:path';

import { parseAutomationProfile, type AutomationSessionSnapshot } from '@neko/automation-contracts';
import {
  parseAutomationSessionControlCommand,
  type AutomationSessionControlProjection,
} from '@neko/automation-contracts/session-control';
import type {
  AutomationApplicationService,
  AutomationHostPermissionPort,
  AutomationSessionGrantAuthority,
  AutomationTargetSelectionCoordinator,
  AutomationTransientObservationStore,
} from '@neko/automation-node';
import {
  CUA_DRIVER_OBSERVE_PROFILE,
  CUA_DRIVER_OBSERVE_TOOL_NAMES,
  createAutomationApplicationService,
  createAutomationSessionAuthorizationService,
  createAutomationSessionGrantAuthority,
  createAutomationTransientObservationStore,
  createCuaDriverComputerTargetDiscovery,
  createReviewedMcpAutomationProvider,
  createSessionOwnedAutomationMcpRuntime,
  cuaDriverArgumentProjector,
  cuaDriverResultProjector,
} from '@neko/automation-node';
import { createAgentAutomationCapabilityTools } from '@neko/agent-runtime/extensions';
import type {
  AgentPluginToolAdapterPort,
  AgentPluginToolAdapterRuntime,
} from '@neko/agent-runtime/extensions';
import {
  createDesktopCuaDriverMcpClientFactory,
  type DesktopCuaDriverMcpClientFactory,
} from './desktop-cua-driver-mcp-client-factory';
import type { DesktopAutomationLocalRuntimeHost } from './desktop-automation-local-runtime-host';

const COMPUTER_USE_PLUGIN_ID = 'computer-use@openneko';
const COMPUTER_USE_SOURCE_ID = 'computer-use.observe.local';

interface ActiveAdapterRuntime {
  readonly pluginId: string;
  readonly service: AutomationApplicationService;
  readonly observations: AutomationTransientObservationStore;
  readonly dispose: () => Promise<void>;
}

export interface DesktopAutomationPluginToolAdapter extends AgentPluginToolAdapterPort {
  listOwnedSessions(pluginId: string): readonly AutomationSessionSnapshot[];
  listSessionControls(scope: unknown): readonly AutomationSessionControlProjection[];
  controlSession(input: unknown): Promise<void>;
  subscribeSessionControls(listener: () => void): () => void;
  consumeTransientImage(input: {
    readonly receiptId: string;
    readonly sessionId: string;
    readonly actionId: string;
  }): { readonly bytes: Uint8Array; readonly mimeType: string };
  dispose(): Promise<void>;
}

export function createDesktopAutomationPluginToolAdapter(options: {
  readonly localRuntimes: DesktopAutomationLocalRuntimeHost;
  readonly targetSelections: AutomationTargetSelectionCoordinator;
  readonly hostPermissions: AutomationHostPermissionPort;
  readonly storageRoot: string;
  readonly platform?: NodeJS.Platform;
  readonly createCuaClients?: (input: {
    readonly appBundlePath: string;
    readonly executablePath: string;
    readonly storageRoot: string;
    readonly platform: NodeJS.Platform;
  }) => DesktopCuaDriverMcpClientFactory;
}): DesktopAutomationPluginToolAdapter {
  const platform = options.platform ?? process.platform;
  const runtimes = new Set<ActiveAdapterRuntime>();
  const listeners = new Set<() => void>();
  let disposed = false;

  const adapter: DesktopAutomationPluginToolAdapter = {
    async build(descriptor) {
      requireActive(disposed);
      if (
        descriptor.pluginId !== COMPUTER_USE_PLUGIN_ID ||
        descriptor.mcpToolExposure !== 'adapter-only'
      ) {
        return undefined;
      }
      const projection = (await options.localRuntimes.management.list()).find(
        (candidate) => candidate.sourceId === COMPUTER_USE_SOURCE_ID,
      );
      if (!projection || projection.state !== 'ready') return undefined;
      const resolution = await options.localRuntimes.resolve(
        COMPUTER_USE_SOURCE_ID,
        projection.runtimeId,
      );
      const appBundlePath = requireAsset(resolution.assets['provider-runtime']);
      const executablePath = path.join(appBundlePath, 'Contents', 'MacOS', 'cua-driver');
      const storageRoot = path.join(options.storageRoot, 'cua-driver');
      const clients = options.createCuaClients
        ? options.createCuaClients({ appBundlePath, executablePath, storageRoot, platform })
        : createDesktopCuaDriverMcpClientFactory({
            runtime: { appBundlePath, executablePath },
            storageRoot,
            platform,
          });
      const targets = createCuaDriverComputerTargetDiscovery({ clients });
      const providerRuntime = createSessionOwnedAutomationMcpRuntime({ clients, targets });
      const profile = createLocalComputerProfile(projection.runtimeId);
      const provider = createReviewedMcpAutomationProvider({
        identity: profile.provider,
        allowedOperations: CUA_DRIVER_OBSERVE_TOOL_NAMES,
        runtime: providerRuntime,
        resultProjector: cuaDriverResultProjector,
        argumentProjector: cuaDriverArgumentProjector,
      });
      const grants: AutomationSessionGrantAuthority = createAutomationSessionGrantAuthority();
      const observations = createAutomationTransientObservationStore({
        ttlMs: 60_000,
        maxBytes: 20 * 1024 * 1024,
      });
      let service: AutomationApplicationService;
      try {
        service = await createAutomationApplicationService({
          profiles: [profile],
          providers: [provider],
          extensionRuntime: {
            isEnabled: async (pluginId) => pluginId === descriptor.pluginId,
          },
          sessionGrants: grants,
          hostPermissions: options.hostPermissions,
          transientObservations: observations,
        });
      } catch (error) {
        observations.dispose();
        await providerRuntime.dispose();
        throw error;
      }
      if (service.listAvailableOperations(profile.id).length !== profile.operations.length) {
        observations.dispose();
        await providerRuntime.dispose();
        throw new Error('Cua Driver did not expose every reviewed Computer operation.');
      }
      const authorization = createAutomationSessionAuthorizationService({
        registrations: [{ profile, targets }],
        grants,
        selection: options.targetSelections,
      });
      const tools = createAgentAutomationCapabilityTools({
        profile,
        service,
        authorization,
      });
      let runtimeDisposed = false;
      const unsubscribe = service.subscribeSessionControls(() => notify(listeners));
      const active: ActiveAdapterRuntime = {
        pluginId: descriptor.pluginId,
        service,
        observations,
        async dispose() {
          if (runtimeDisposed) return;
          runtimeDisposed = true;
          runtimes.delete(active);
          unsubscribe();
          const results = await Promise.allSettled([
            providerRuntime.dispose(),
            Promise.resolve().then(() => observations.dispose()),
          ]);
          notify(listeners);
          const errors = results.flatMap((result) =>
            result.status === 'rejected' ? [result.reason] : [],
          );
          if (errors.length > 0) {
            throw new AggregateError(errors, 'Failed to dispose the Cua Driver adapter runtime.');
          }
        },
      };
      runtimes.add(active);
      notify(listeners);
      return Object.freeze({
        sourceFingerprint: `${COMPUTER_USE_SOURCE_ID}:${projection.runtimeId}`,
        tools,
        readiness: Object.freeze({ status: 'ready' as const, diagnosticCode: '' }),
        dispose: active.dispose,
      } satisfies AgentPluginToolAdapterRuntime);
    },

    listOwnedSessions(pluginId) {
      requireActive(disposed);
      const sessions = [...runtimes]
        .filter((runtime) => runtime.pluginId === pluginId)
        .flatMap((runtime) => runtime.service.listOwnedSessions(pluginId));
      assertUniqueSessionIds(sessions);
      return Object.freeze(
        sessions.sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
      );
    },

    listSessionControls(scope) {
      requireActive(disposed);
      const controls = [...runtimes].flatMap((runtime) =>
        runtime.service.listSessionControls(scope),
      );
      assertUniqueSessionIds(controls);
      return Object.freeze(
        controls.sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
      );
    },

    async controlSession(input) {
      requireActive(disposed);
      const command = parseAutomationSessionControlCommand(input);
      const owners = [...runtimes].filter(
        (runtime) => runtime.service.readSession(command.sessionId) !== undefined,
      );
      if (owners.length !== 1) {
        throw new Error(
          owners.length === 0
            ? `Automation session '${command.sessionId}' is unavailable.`
            : `Automation session '${command.sessionId}' has multiple runtime owners.`,
        );
      }
      const owner = owners[0];
      if (!owner) throw new Error(`Automation session '${command.sessionId}' is unavailable.`);
      await owner.service.controlSession(command);
    },

    subscribeSessionControls(listener) {
      requireActive(disposed);
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    consumeTransientImage(input) {
      requireActive(disposed);
      const owners = [...runtimes].filter(
        (runtime) => runtime.observations.readReceipt(input.receiptId) !== undefined,
      );
      if (owners.length !== 1) {
        throw new Error(
          owners.length === 0
            ? 'Automation observation receipt is unavailable or expired.'
            : `Automation observation receipt '${input.receiptId}' has multiple runtime owners.`,
        );
      }
      const owner = owners[0];
      if (!owner) throw new Error('Automation observation receipt is unavailable or expired.');
      const consumed = owner.observations.consume(input);
      return { bytes: consumed.data, mimeType: consumed.receipt.mimeType };
    },

    async dispose() {
      if (disposed) return;
      disposed = true;
      const results = await Promise.allSettled([...runtimes].map((runtime) => runtime.dispose()));
      listeners.clear();
      const errors = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : [],
      );
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Failed to dispose Desktop Automation adapters.');
      }
    },
  };
  return Object.freeze(adapter);
}

function createLocalComputerProfile(runtimeId: string) {
  return parseAutomationProfile({
    ...CUA_DRIVER_OBSERVE_PROFILE,
    id: COMPUTER_USE_SOURCE_ID,
    provider: {
      ...CUA_DRIVER_OBSERVE_PROFILE.provider,
      deliverySource: { kind: 'user-managed-local-runtime', runtimeId },
    },
  });
}

function requireAsset(value: string | undefined): string {
  if (!value) throw new Error('Cua Driver application authorization is unavailable.');
  return value;
}

function assertUniqueSessionIds(sessions: readonly { readonly sessionId: string }[]): void {
  const identities = new Set<string>();
  for (const session of sessions) {
    if (identities.has(session.sessionId)) {
      throw new Error(`Automation session '${session.sessionId}' has multiple runtime owners.`);
    }
    identities.add(session.sessionId);
  }
}

function requireActive(disposed: boolean): void {
  if (disposed) throw new Error('Desktop Automation plugin adapter is disposed.');
}

function notify(listeners: ReadonlySet<() => void>): void {
  for (const listener of listeners) listener();
}
