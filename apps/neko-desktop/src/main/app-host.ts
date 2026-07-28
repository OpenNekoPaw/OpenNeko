import { randomUUID } from 'node:crypto';
import {
  NEKO_APPLICATION_CONTRACT_VERSION,
  type NekoApplicationIdentity,
} from '@neko/host/application';
import type { NekoHostPorts } from '@neko/host/ports';
import type { ILogger } from '@neko/shared/logger';
import {
  DESKTOP_BRIDGE_CONTRACT_VERSION,
  parseDesktopBootstrapRequest,
  type DesktopBootstrapProjection,
} from '../shared/bridge-contract';
import {
  DESKTOP_SHELL_CONTRACT_VERSION,
  parseDesktopProfileRequest,
  parseDesktopShellRequest,
  parseDesktopTabMutationRequest,
  parseDesktopWindowMutationRequest,
  type DesktopOpenContentResult,
  type DesktopProfileRequestResult,
  type DesktopShellResponse,
} from '../shared/shell-contract';
import {
  DesktopWindowRegistry,
  type DesktopSenderIdentity,
} from './window-registry';
import type { DesktopShellService } from './shell-service';

export interface DesktopAppHostOptions {
  readonly host: NekoHostPorts;
  readonly version: string;
  readonly logger: ILogger;
  readonly shell: DesktopShellService;
  readonly instanceId?: string;
}

export class DesktopAppHost {
  readonly applicationIdentity: NekoApplicationIdentity;
  readonly windows = new DesktopWindowRegistry();
  readonly shell: DesktopShellService;
  private disposed = false;

  constructor(private readonly options: DesktopAppHostOptions) {
    this.applicationIdentity = {
      schemaVersion: NEKO_APPLICATION_CONTRACT_VERSION,
      applicationId: 'neko-desktop',
      instanceId: options.instanceId ?? randomUUID(),
      version: options.version,
    };
    this.shell = options.shell;
  }

  async createBootstrapProjection(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopBootstrapProjection> {
    this.requireActive();
    const request = parseDesktopBootstrapRequest(payload);
    const window = this.windows.resolveSender(sender);
    const host = await this.options.host.environment.getHostIdentity();
    const runtime = await this.options.host.environment.getRuntimeInfo();
    if (host.kind !== 'electron' || host.ui !== 'graphical') {
      throw new Error(
        `Desktop AppHost requires a graphical Electron host; received '${host.kind}/${host.ui}'.`,
      );
    }
    return {
      schemaVersion: DESKTOP_BRIDGE_CONTRACT_VERSION,
      requestId: request.requestId,
      application: this.applicationIdentity,
      window: {
        windowId: window.windowId,
        rendererEpoch: window.rendererEpoch,
      },
      host,
      runtime: {
        platform: runtime.platform,
        ...(runtime.arch ? { arch: runtime.arch } : {}),
        ...(runtime.locale ? { locale: runtime.locale } : {}),
      },
      status: 'foundation-ready',
    };
  }

  reportError(code: string, message: string, error?: unknown): void {
    this.options.host.diagnostics?.report({
      code,
      severity: 'error',
      message,
      metadata: error === undefined ? undefined : { error: describeError(error) },
    });
  }

  async createShellSnapshot(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopShellRequest(payload);
    const window = this.windows.resolveSender(sender);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      projection: await this.shell.getProjection(window.windowId),
    };
  }

  async openContentProject(
    sender: DesktopSenderIdentity,
    payload: unknown,
    selectWorkspace: () => Promise<string | undefined>,
  ): Promise<DesktopOpenContentResult> {
    this.requireActive();
    const request = parseDesktopWindowMutationRequest(payload);
    const window = this.windows.resolveSender(sender);
    await this.shell.assertWindowMutationContext(
      window.windowId,
      request.expectedEndpointEpoch,
      request.expectedWindowRevision,
    );
    const workspacePath = await selectWorkspace();
    if (!workspacePath) {
      return {
        schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
        requestId: request.requestId,
        status: 'cancelled',
        projection: await this.shell.getProjection(window.windowId),
      };
    }
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      status: 'opened',
      projection: await this.shell.openContent(
        window.windowId,
        workspacePath,
        request.expectedEndpointEpoch,
        request.expectedWindowRevision,
      ),
    };
  }

  async requestProjectProfile(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopProfileRequestResult> {
    this.requireActive();
    const request = parseDesktopProfileRequest(payload);
    const window = this.windows.resolveSender(sender);
    return this.shell.requestUnavailableProfile(
      window.windowId,
      request.requestId,
      request.profile,
    );
  }

  async activateProjectTab(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    return this.mutateProjectTab(sender, payload, 'activate');
  }

  async activateHome(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopTabMutationRequest(payload);
    if (request.tabId !== 'home') {
      throw new Error("Desktop Home activation requires the fixed 'home' target.");
    }
    const window = this.windows.resolveSender(sender);
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      projection: await this.shell.activateHome(
        window.windowId,
        request.expectedEndpointEpoch,
        request.expectedWindowRevision,
      ),
    };
  }

  async closeProjectTab(
    sender: DesktopSenderIdentity,
    payload: unknown,
  ): Promise<DesktopShellResponse> {
    return this.mutateProjectTab(sender, payload, 'close');
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    try {
      this.windows.disposeAll();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.shell.dispose();
    } catch (error) {
      errors.push(error);
    }
    this.options.logger.info('Desktop AppHost disposed.', {
      applicationInstanceId: this.applicationIdentity.instanceId,
    });
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to dispose Desktop AppHost.');
    }
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new Error('Desktop AppHost is disposed.');
    }
  }

  private async mutateProjectTab(
    sender: DesktopSenderIdentity,
    payload: unknown,
    operation: 'activate' | 'close',
  ): Promise<DesktopShellResponse> {
    this.requireActive();
    const request = parseDesktopTabMutationRequest(payload);
    const window = this.windows.resolveSender(sender);
    const projection =
      operation === 'activate'
        ? await this.shell.activateTab(
            window.windowId,
            request.tabId,
            request.expectedEndpointEpoch,
            request.expectedWindowRevision,
          )
        : await this.shell.closeTab(
            window.windowId,
            request.tabId,
            request.expectedEndpointEpoch,
            request.expectedWindowRevision,
          );
    return {
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: request.requestId,
      projection,
    };
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
