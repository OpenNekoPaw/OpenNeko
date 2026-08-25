import type {
  DesktopAgentHomeNavigationIdentity,
  DesktopShellProjection,
} from './desktop-shell-contract';
import type { DesktopProjectCatalogRemovalResult } from './desktop-shell-service';

export interface DesktopConversationManagementPort {
  archiveConversations(conversations: readonly DesktopAgentHomeNavigationIdentity[]): Promise<void>;
  deleteUnavailableConversation(conversation: DesktopAgentHomeNavigationIdentity): Promise<void>;
}

export interface DesktopProjectRegistrationShellPort {
  getProjection(windowId: string): Promise<DesktopShellProjection>;
  resolveAgentHomeConversations(
    windowId: string,
    navigations: readonly DesktopAgentHomeNavigationIdentity[],
    rendererSessionId: string,
  ): Promise<readonly DesktopAgentHomeNavigationIdentity[]>;
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

export interface DesktopProjectRegistrationServiceOptions {
  readonly conversations: DesktopConversationManagementPort;
  readonly shell: DesktopProjectRegistrationShellPort;
}

export class DesktopProjectRegistrationService {
  constructor(private readonly options: DesktopProjectRegistrationServiceOptions) {}

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

  async archiveProjectConversations(
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
      await this.options.conversations.archiveConversations(conversations);
    }
    return this.options.shell.getProjection(windowId);
  }

  async archiveConversations(
    windowId: string,
    rendererSessionId: string,
    navigations: readonly DesktopAgentHomeNavigationIdentity[],
  ): Promise<DesktopShellProjection> {
    if (navigations.length === 0) {
      throw new Error('At least one Agent Home Conversation is required for archive.');
    }
    const conversations = await this.options.shell.resolveAgentHomeConversations(
      windowId,
      navigations,
      rendererSessionId,
    );
    await this.options.conversations.archiveConversations(conversations);
    return this.options.shell.getProjection(windowId);
  }

  async deleteUnavailableConversation(
    windowId: string,
    rendererSessionId: string,
    navigation: DesktopAgentHomeNavigationIdentity,
  ): Promise<DesktopShellProjection> {
    const [conversation] = await this.options.shell.resolveAgentHomeConversations(
      windowId,
      [navigation],
      rendererSessionId,
    );
    if (conversation === undefined) {
      throw new Error('Unavailable Agent Home Conversation was not resolved for deletion.');
    }
    await this.options.conversations.deleteUnavailableConversation(conversation);
    return this.options.shell.getProjection(windowId);
  }
}
