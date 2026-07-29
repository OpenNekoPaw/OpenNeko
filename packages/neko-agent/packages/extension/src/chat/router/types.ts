import type * as vscode from 'vscode';
import type {
  ActivateConversationWebviewMessage,
  ProjectionAttachmentKey,
  UpdateTabStateWebviewMessage,
} from '@neko-agent/types';
import type { AgentCapabilityLifecycleDescriptor } from '@neko/shared';
import type { AgentHostConnectionIdentity } from '@neko/agent/runtime';
import type { DragDropBroker } from '../../services/DragDropBroker';
import type { AgentMessageTurnHandler } from '../agentMessageTurnHandler';
import type {
  CharacterDialogueController,
  EmbodyCharacterController,
} from '@neko/chara/host-vscode';
import type { ConversationProjectionAttachmentServer } from '@neko/agent/runtime';
import type {
  ContextHandler,
  ConversationMessageHandler,
  FileOperationHandler,
  SettingsHandler,
  SkillHandler,
  SlashCommandHandler,
} from '../handlers';

export interface VSCodeAgentHostControllerDeps {
  readonly webview: vscode.Webview;
  readonly connectionIdentity: AgentHostConnectionIdentity;
  readonly projectionAttachments: ConversationProjectionAttachmentServer;
  readonly announceProjectionEndpoint: (protocolVersion: number, realmId: string) => void;
  readonly reportProjectionProtocolError: (error: Error, key: ProjectionAttachmentKey) => void;
  readonly messages?: AgentMessageTurnHandler;
  readonly characterDialogue?: CharacterDialogueController;
  readonly embodyCharacter?: EmbodyCharacterController;
  readonly skillHandler: SkillHandler;
  readonly fileOperationHandler: FileOperationHandler;
  readonly settingsHandler: SettingsHandler;
  readonly contextHandler: ContextHandler;
  readonly slashCommandHandler: SlashCommandHandler;
  readonly conversationMessageHandler: ConversationMessageHandler;
  readonly dndBroker: DragDropBroker;
  readonly sendConfigState: () => Promise<void>;
  readonly refreshConfigSnapshot: () => Promise<void>;
  readonly openUserConfigFile: () => Promise<void>;
  readonly sendTabState: () => void;
  readonly activateConversation: (message: ActivateConversationWebviewMessage) => void;
  readonly updateTabState: (message: UpdateTabStateWebviewMessage) => void;
  readonly setKeyboardFocused: (focused: boolean) => void | Promise<void>;
  readonly setKeyboardEditable: (editable: boolean) => void | Promise<void>;
  readonly syncCanvasAmbientScopeFromActiveConversation: () => void;
  readonly resolveLifecycleCapabilityDescriptor?: (
    capabilityId: string,
  ) => AgentCapabilityLifecycleDescriptor | undefined;
}
