import {
  parseProfessionalApplicationHostRequest,
  type ProfessionalApplicationHostResult,
} from '@neko/professional-apps-contracts/host';
import type { ProfessionalApplicationService } from '@neko/professional-apps-node';
import type { DesktopSenderIdentity } from './window-registry';

export class DesktopProfessionalApplicationHost {
  constructor(
    private readonly options: {
      readonly service: ProfessionalApplicationService;
      readonly windows: {
        resolveSender(sender: DesktopSenderIdentity): {
          readonly windowId: string;
          readonly rendererSessionId: string;
        };
      };
      readonly selection: {
        selectApplicationIdentity(
          sender: DesktopSenderIdentity,
          integrationId: string,
        ): Promise<string | undefined>;
      };
    },
  ) {}

  async execute(
    sender: DesktopSenderIdentity,
    value: unknown,
  ): Promise<ProfessionalApplicationHostResult> {
    const request = parseProfessionalApplicationHostRequest(value);
    const window = this.options.windows.resolveSender(sender);
    if (window.windowId !== request.identity.windowId) {
      throw new Error('Professional application request does not match its sender-bound Window.');
    }
    if (request.route === 'binding.update') {
      const projection = await this.options.service.updateBinding(
        request.identity.windowId,
        request.binding,
      );
      return { requestId: request.requestId, route: request.route, projection };
    }
    if (request.route === 'binding.add') {
      const projection = await this.options.service.addBinding(
        request.identity.windowId,
        request.integrationId,
      );
      return { requestId: request.requestId, route: request.route, projection };
    }
    if (request.route === 'enablement.update') {
      const projection = await this.options.service.setEnabled(
        request.identity.windowId,
        request.integrationId,
        request.enabled,
      );
      return { requestId: request.requestId, route: request.route, projection };
    }
    if (request.route === 'binding.remove') {
      const projection = await this.options.service.removeBinding(
        request.identity.windowId,
        request.integrationId,
      );
      return { requestId: request.requestId, route: request.route, projection };
    }
    if (request.route === 'application.select') {
      const applicationIdentity = await this.options.selection.selectApplicationIdentity(
        sender,
        request.integrationId,
      );
      const projection = applicationIdentity
        ? await this.options.service.bindApplicationIdentity(
            request.identity.windowId,
            request.integrationId,
            applicationIdentity,
          )
        : await this.options.service.getProjection(request.identity.windowId);
      return {
        requestId: request.requestId,
        route: request.route,
        projection,
        selectionReceipt: {
          integrationId: request.integrationId,
          status: applicationIdentity ? 'selected' : 'cancelled',
        },
      };
    }
    if (request.route === 'application.launch') {
      const launchReceipt = await this.options.service.launch(request.integrationId);
      const projection = await this.options.service.getProjection(request.identity.windowId);
      return {
        requestId: request.requestId,
        route: request.route,
        projection,
        launchReceipt,
      };
    }
    return {
      requestId: request.requestId,
      route: request.route,
      projection: await this.options.service.getProjection(request.identity.windowId),
    };
  }
}
