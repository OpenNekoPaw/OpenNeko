import type {
  DesktopAgentHomeNavigationIdentity,
  DesktopShellProjection,
} from './desktop-shell-contract';
import type { DesktopProjectCatalogRemovalResult } from './desktop-shell-service';

export interface DesktopConversationDeletionPort {
  deleteConversations(conversations: readonly DesktopAgentHomeNavigationIdentity[]): Promise<void>;
}

export interface DesktopProjectManagementShellPort {
  getProjection(windowId: string): Promise<DesktopShellProjection>;
  removeProjectsFromCatalog(
    windowId: string,
    projectIds: readonly string[],
    rendererSessionId: string,
  ): Promise<DesktopProjectCatalogRemovalResult>;
  resolveProjectWorkspaceConversations(
    windowId: string,
    projectIds: readonly string[],
    rendererSessionId: string,
  ): Promise<readonly DesktopAgentHomeNavigationIdentity[]>;
}

export interface DesktopProjectManagementServiceOptions {
  readonly conversations: DesktopConversationDeletionPort;
  readonly shell: DesktopProjectManagementShellPort;
}

export class DesktopProjectManagementService {
  constructor(private readonly options: DesktopProjectManagementServiceOptions) {}

  async removeProjects(
    windowId: string,
    rendererSessionId: string,
    projectIds: readonly string[],
  ): Promise<DesktopShellProjection> {
    const result = await this.options.shell.removeProjectsFromCatalog(
      windowId,
      projectIds,
      rendererSessionId,
    );
    return result.projection;
  }

  async deleteProjectConversations(
    windowId: string,
    rendererSessionId: string,
    projectIds: readonly string[],
  ): Promise<DesktopShellProjection> {
    const conversations = await this.options.shell.resolveProjectWorkspaceConversations(
      windowId,
      projectIds,
      rendererSessionId,
    );
    if (conversations.length > 0) {
      await this.options.conversations.deleteConversations(conversations);
    }
    return this.options.shell.getProjection(windowId);
  }
}
