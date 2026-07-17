import type * as vscode from 'vscode';
import type {
  ActivateConversationWebviewMessage,
  ProjectionAttachmentKey,
  UpdateTabStateWebviewMessage,
} from '@neko-agent/types';
import type { AgentCapabilityLifecycleDescriptor } from '@neko/shared';
import type { DragDropBroker } from '../../services/DragDropBroker';
import type { AgentMessageTurnHandler } from '../agentMessageTurnHandler';
import type { CharacterDialogueController } from '../characterDialogueController';
import type { EmbodyCharacterController } from '../embodyCharacterController';
import type { ConversationProjectionAttachmentServer } from '../projection/conversationProjectionAttachmentServer';
import type {
  ContextHandler,
  ConversationMessageHandler,
  FileOperationHandler,
  SettingsHandler,
  SkillHandler,
  SlashCommandHandler,
  TaskHandler,
} from '../handlers';

export interface ChatWebviewMessageRouterDeps {
  readonly webview: vscode.Webview;
  readonly projectionAttachments: ConversationProjectionAttachmentServer;
  readonly announceProjectionEndpoint: (protocolVersion: number, realmId: string) => void;
  readonly reportProjectionProtocolError: (error: Error, key: ProjectionAttachmentKey) => void;
  readonly messages?: AgentMessageTurnHandler;
  readonly characterDialogue?: CharacterDialogueController;
  readonly embodyCharacter?: EmbodyCharacterController;
  readonly taskHandler: TaskHandler;
  readonly skillHandler: SkillHandler;
  readonly fileOperationHandler: FileOperationHandler;
  readonly settingsHandler: SettingsHandler;
  readonly contextHandler: ContextHandler;
  readonly slashCommandHandler: SlashCommandHandler;
  readonly conversationMessageHandler: ConversationMessageHandler;
  readonly dndBroker: DragDropBroker;
  readonly refreshConfigSnapshot: () => void;
  readonly sendTabState: () => void;
  readonly activateConversation: (message: ActivateConversationWebviewMessage) => void;
  readonly updateTabState: (message: UpdateTabStateWebviewMessage) => void;
  readonly syncCanvasAmbientScopeFromActiveConversation: () => void;
  readonly resolveLifecycleCapabilityDescriptor?: (
    capabilityId: string,
  ) => AgentCapabilityLifecycleDescriptor | undefined;
}
