import {
  parseAutomationPermissionManagementHostRequest,
  type AutomationPermissionManagementHostRequest,
  type AutomationPermissionManagementProjection,
  type AutomationPermissionManagementRuntime,
  type OpenNekoAutomationPermissionManagementBridge,
} from '@neko/automation-contracts/permission-management';
import type { AutomationPermission } from '@neko/automation-contracts';

type RequestInput = AutomationPermissionManagementHostRequest extends infer Request
  ? Request extends AutomationPermissionManagementHostRequest
    ? Omit<Request, 'requestId' | 'identity'>
    : never
  : never;

export class DesktopAutomationPermissionManagementRuntime implements AutomationPermissionManagementRuntime {
  private disposed = false;

  constructor(
    readonly identity: { readonly windowId: string },
    private readonly bridge: OpenNekoAutomationPermissionManagementBridge,
  ) {}

  getSnapshot(): Promise<AutomationPermissionManagementProjection> {
    return this.execute({ route: 'snapshot.get' });
  }

  request(permission: AutomationPermission): Promise<AutomationPermissionManagementProjection> {
    return this.execute({ route: 'permission.request', permission });
  }

  dispose(): void {
    this.disposed = true;
  }

  private async execute(input: RequestInput): Promise<AutomationPermissionManagementProjection> {
    if (this.disposed) throw new Error('Desktop Automation permission runtime is disposed.');
    const request = parseAutomationPermissionManagementHostRequest({
      requestId: crypto.randomUUID(),
      identity: this.identity,
      ...input,
    });
    return (await this.bridge.automationPermissions.execute(request)).projection;
  }
}
