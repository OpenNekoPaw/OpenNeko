import type {
  ProfessionalApplicationBinding,
  ProfessionalApplicationLaunchReceipt,
  ProfessionalApplicationManagementProjection,
  ProfessionalApplicationManagementRuntime,
} from '@neko/professional-apps-contracts';
import {
  createProfessionalApplicationHostRequest,
  type OpenNekoProfessionalApplicationBridge,
  type ProfessionalApplicationHostRequest,
} from '@neko/professional-apps-contracts/host';

type ProfessionalApplicationRequestInput<
  Request extends ProfessionalApplicationHostRequest = ProfessionalApplicationHostRequest,
> = Request extends unknown ? Omit<Request, 'requestId' | 'identity'> : never;

export class DesktopProfessionalApplicationRuntime implements ProfessionalApplicationManagementRuntime {
  private disposed = false;

  constructor(
    readonly identity: { readonly windowId: string },
    private readonly bridge: OpenNekoProfessionalApplicationBridge,
  ) {}

  async getSnapshot(): Promise<ProfessionalApplicationManagementProjection> {
    return (await this.execute({ route: 'snapshot.get' })).projection;
  }

  async updateBinding(
    binding: ProfessionalApplicationBinding,
  ): Promise<ProfessionalApplicationManagementProjection> {
    return (await this.execute({ route: 'binding.update', binding })).projection;
  }

  async selectApplication(
    integrationId: string,
  ): Promise<ProfessionalApplicationManagementProjection> {
    return (await this.execute({ route: 'application.select', integrationId })).projection;
  }

  async launch(integrationId: string): Promise<ProfessionalApplicationLaunchReceipt> {
    const result = await this.execute({ route: 'application.launch', integrationId });
    if (!result.launchReceipt) {
      throw new Error('Professional application launch completed without a receipt.');
    }
    return result.launchReceipt;
  }

  dispose(): void {
    this.disposed = true;
  }

  private async execute(input: ProfessionalApplicationRequestInput) {
    if (this.disposed) throw new Error('Desktop Professional Application runtime is disposed.');
    const requestId = crypto.randomUUID();
    const request =
      input.route === 'snapshot.get'
        ? createProfessionalApplicationHostRequest({
            requestId,
            identity: this.identity,
            route: input.route,
          })
        : input.route === 'binding.update'
          ? createProfessionalApplicationHostRequest({
              requestId,
              identity: this.identity,
              route: input.route,
              binding: input.binding,
            })
          : createProfessionalApplicationHostRequest({
              requestId,
              identity: this.identity,
              route: input.route,
              integrationId: input.integrationId,
            });
    return this.bridge.professionalApplications.execute(request);
  }
}
