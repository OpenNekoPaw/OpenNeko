import {
  parseAutomationLocalRuntimeManagementHostRequest,
  type AutomationLocalRuntimeAssetKey,
  type AutomationLocalRuntimeManagementHostRequest,
  type AutomationLocalRuntimeManagementProjection,
  type AutomationLocalRuntimeManagementRuntime,
  type OpenNekoAutomationLocalRuntimeManagementBridge,
} from '@neko/automation-contracts/local-runtime-management';

type RequestInput = AutomationLocalRuntimeManagementHostRequest extends infer Request
  ? Request extends AutomationLocalRuntimeManagementHostRequest
    ? Omit<Request, 'requestId' | 'identity'>
    : never
  : never;

export class DesktopAutomationLocalRuntimeManagementRuntime implements AutomationLocalRuntimeManagementRuntime {
  private disposed = false;

  constructor(
    readonly identity: { readonly windowId: string },
    private readonly bridge: OpenNekoAutomationLocalRuntimeManagementBridge,
  ) {}

  getSnapshot(): Promise<AutomationLocalRuntimeManagementProjection> {
    return this.execute({ route: 'snapshot.get' });
  }

  openInstallationGuide(sourceId: string): Promise<AutomationLocalRuntimeManagementProjection> {
    return this.execute({ route: 'guide.open', sourceId });
  }

  copyInstallationCommand(sourceId: string): Promise<AutomationLocalRuntimeManagementProjection> {
    return this.execute({ route: 'command.copy', sourceId });
  }

  authorizeAsset(
    sourceId: string,
    assetKey: AutomationLocalRuntimeAssetKey,
  ): Promise<AutomationLocalRuntimeManagementProjection> {
    return this.execute({ route: 'asset.authorize', sourceId, assetKey });
  }

  recheck(
    sourceId: string,
    runtimeId: string,
  ): Promise<AutomationLocalRuntimeManagementProjection> {
    return this.execute({ route: 'runtime.recheck', sourceId, runtimeId });
  }

  disconnect(
    sourceId: string,
    runtimeId: string,
  ): Promise<AutomationLocalRuntimeManagementProjection> {
    return this.execute({ route: 'runtime.disconnect', sourceId, runtimeId });
  }

  dispose(): void {
    this.disposed = true;
  }

  private async execute(input: RequestInput): Promise<AutomationLocalRuntimeManagementProjection> {
    if (this.disposed) throw new Error('Desktop Automation local runtime is disposed.');
    const request = parseAutomationLocalRuntimeManagementHostRequest({
      requestId: crypto.randomUUID(),
      identity: this.identity,
      ...input,
    });
    return (await this.bridge.automationLocalRuntimes.execute(request)).projection;
  }
}
