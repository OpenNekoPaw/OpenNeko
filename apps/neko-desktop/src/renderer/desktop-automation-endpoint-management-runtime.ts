import {
  parseAutomationEndpointManagementHostRequest,
  type AutomationEndpointConfigurationInput,
  type AutomationEndpointManagementHostRequest,
  type AutomationEndpointManagementProjection,
  type AutomationEndpointManagementRuntime,
  type OpenNekoAutomationEndpointManagementBridge,
} from '@neko/automation-contracts/endpoint-management';

type RequestInput = AutomationEndpointManagementHostRequest extends infer Request
  ? Request extends AutomationEndpointManagementHostRequest
    ? Omit<Request, 'requestId' | 'identity'>
    : never
  : never;

export class DesktopAutomationEndpointManagementRuntime implements AutomationEndpointManagementRuntime {
  private disposed = false;

  constructor(
    readonly identity: { readonly windowId: string },
    private readonly bridge: OpenNekoAutomationEndpointManagementBridge,
  ) {}

  getSnapshot(): Promise<AutomationEndpointManagementProjection> {
    return this.execute({ route: 'snapshot.get' });
  }

  configure(
    input: AutomationEndpointConfigurationInput,
  ): Promise<AutomationEndpointManagementProjection> {
    return this.execute({ route: 'endpoint.configure', configuration: input });
  }

  remove(connectorId: string, endpointId: string): Promise<AutomationEndpointManagementProjection> {
    return this.execute({ route: 'endpoint.remove', connectorId, endpointId });
  }

  dispose(): void {
    this.disposed = true;
  }

  private async execute(input: RequestInput): Promise<AutomationEndpointManagementProjection> {
    if (this.disposed) throw new Error('Desktop Automation endpoint runtime is disposed.');
    const request = parseAutomationEndpointManagementHostRequest({
      requestId: crypto.randomUUID(),
      identity: this.identity,
      ...input,
    });
    return (await this.bridge.automationEndpoints.execute(request)).projection;
  }
}
