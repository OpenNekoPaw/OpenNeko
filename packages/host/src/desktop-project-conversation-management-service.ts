import type {
  DesktopAgentHomeNavigationIdentity,
  DesktopShellProjection,
} from './desktop-shell-contract';
import type { DesktopProjectCatalogRemovalResult } from './desktop-shell-service';

export interface DesktopConversationDeletionPort {
  deleteConversations(conversations: readonly DesktopAgentHomeNavigationIdentity[]): Promise<void>;
}

export interface DesktopProjectCatalogRemovalPort {
  getProjection(windowId: string): Promise<DesktopShellProjection>;
  removeProjectsFromCatalog(
    windowId: string,
    projectIds: readonly string[],
    rendererSessionId: string,
  ): Promise<DesktopProjectCatalogRemovalResult>;
}

export interface DesktopProjectConversationManagementServiceOptions {
  readonly conversations: DesktopConversationDeletionPort;
  readonly shell: DesktopProjectCatalogRemovalPort;
}

export class DesktopProjectConversationManagementService {
  constructor(private readonly options: DesktopProjectConversationManagementServiceOptions) {}

  async deleteProjects(
    windowId: string,
    rendererSessionId: string,
    projectIds: readonly string[],
  ): Promise<DesktopShellProjection> {
    const removed = await this.options.shell.removeProjectsFromCatalog(
      windowId,
      projectIds,
      rendererSessionId,
    );
    if (removed.conversations.length > 0) {
      await this.options.conversations.deleteConversations(removed.conversations);
    }
    return this.options.shell.getProjection(windowId);
  }
}
