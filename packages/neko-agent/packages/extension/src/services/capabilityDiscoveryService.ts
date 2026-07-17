/**
 * Capability Discovery Service — VSCode bridge for capability runtime.
 *
 * Extension responsibilities:
 * - Register the `neko.agent.registerCapabilities` command
 * - Scan installed VSCode extensions for static capability manifests
 * - Forward lifecycle events to Webview/Agent managers
 *
 * Provider injection, collision diagnostics, category projection and
 * subpackage resolution live in @neko/agent's CapabilityRegistryRuntime.
 */

import * as vscode from 'vscode';
import {
  CapabilityRegistryRuntime,
  type CapabilityDiscoveryDeps,
  type CapabilityProtocolInfo,
} from '@neko/agent/runtime';
import type {
  AgentCapabilityContext,
  AgentCapabilityLifecycleDescriptor,
  AgentCapabilityManifest,
  AgentCapabilityProvider,
  PromptFragment,
} from '@neko/shared';
import { NEKO_AGENT_REGISTER_CAPABILITIES_COMMAND } from '@neko-agent/types';
import { getRootLogger } from '../base';

export type { CapabilityDiscoveryDeps, CapabilityProtocolInfo };

export class CapabilityDiscoveryService implements vscode.Disposable {
  private readonly _runtime: CapabilityRegistryRuntime;
  private readonly _disposables: vscode.Disposable[] = [];
  private _capabilityContext: AgentCapabilityContext | null = null;

  private readonly _onDidRegister = new vscode.EventEmitter<AgentCapabilityProvider>();
  readonly onDidRegister = this._onDidRegister.event;

  private readonly _onDidUnregister = new vscode.EventEmitter<string>();
  readonly onDidUnregister = this._onDidUnregister.event;

  constructor(deps: CapabilityDiscoveryDeps) {
    this._runtime = new CapabilityRegistryRuntime(deps, {
      logger: getRootLogger().child('CapabilityDiscovery'),
    });
  }

  activate(
    context: vscode.ExtensionContext,
    capabilityContext?: Omit<AgentCapabilityContext, 'extensionContext'>,
  ): void {
    this._capabilityContext = {
      extensionContext: context,
      ...capabilityContext,
    };
    this._runtime.setCapabilityContext(this._capabilityContext);

    this._disposables.push(
      vscode.commands.registerCommand(
        NEKO_AGENT_REGISTER_CAPABILITIES_COMMAND,
        (provider: AgentCapabilityProvider) => {
          this.registerProvider(provider, this._capabilityContext!);
        },
      ),
    );

    this._discoverManifests();

    this._disposables.push(
      vscode.extensions.onDidChange(() => {
        this._discoverManifests();
        this._cleanupRemovedExtensions();
      }),
    );

    this.syncToolCategories();
  }

  dispose(): void {
    this._runtime.dispose();
    for (const disposable of this._disposables) {
      disposable.dispose();
    }
    this._onDidRegister.dispose();
    this._onDidUnregister.dispose();
  }

  registerProvider(provider: AgentCapabilityProvider, context: AgentCapabilityContext): void {
    this._capabilityContext = context;
    this._runtime.registerProvider(provider, context);
    this._onDidRegister.fire(provider);
  }

  unregisterProvider(id: string): void {
    if (this._runtime.unregisterProvider(id)) {
      this._onDidUnregister.fire(id);
    }
  }

  syncToolCategories(targetRegistry?: CapabilityDiscoveryDeps['toolCategoryRegistry']): void {
    this._runtime.syncToolCategories(targetRegistry);
  }

  getAllProviders(): AgentCapabilityProvider[] {
    return this._runtime.getAllProviders();
  }

  getAllPromptFragments(): PromptFragment[] {
    return this._runtime.getAllPromptFragments();
  }

  getLifecycleCapabilityDescriptor(
    capabilityId: string,
  ): AgentCapabilityLifecycleDescriptor | undefined {
    if (!this._capabilityContext) return undefined;

    for (const provider of this._runtime.getAllProviders()) {
      const facets = provider.getArtifactFacets?.(this._capabilityContext);
      const descriptor = facets?.lifecycleCapabilities?.find(
        (candidate) => candidate.capabilityId === capabilityId,
      );
      if (descriptor) return descriptor;
    }

    return undefined;
  }

  getAllManifests(): AgentCapabilityManifest[] {
    return this._runtime.getAllManifests();
  }

  getCapabilityProtocolInfo(id: string): CapabilityProtocolInfo | null {
    return this._runtime.getCapabilityProtocolInfo(id);
  }

  hasProvider(id: string): boolean {
    return this._runtime.hasProvider(id);
  }

  get providerCount(): number {
    return this._runtime.providerCount;
  }

  getSubpackage(id: string): { id: string; version: string; enabled: boolean } | null {
    return this._runtime.getSubpackage(id);
  }

  private _discoverManifests(): void {
    this._runtime.replaceManifests(readInstalledCapabilityManifests());
  }

  private _cleanupRemovedExtensions(): void {
    for (const id of this._runtime.cleanupProvidersWithoutManifests()) {
      getRootLogger()
        .child('CapabilityDiscovery')
        .info(`Extension for provider "${id}" removed — unregistering`);
      this._onDidUnregister.fire(id);
    }
  }
}

function readInstalledCapabilityManifests(): AgentCapabilityManifest[] {
  const manifests: AgentCapabilityManifest[] = [];
  for (const ext of vscode.extensions.all) {
    const manifest = (
      ext.packageJSON as {
        contributes?: { 'neko.agentCapabilities'?: AgentCapabilityManifest };
      }
    )?.contributes?.['neko.agentCapabilities'];

    if (manifest?.id) {
      manifests.push(manifest);
    }
  }
  return manifests;
}
