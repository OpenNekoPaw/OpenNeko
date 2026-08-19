import type {
  LoadSessionRequest,
  LoadSessionResponse,
  PromptRequest,
  PromptResponse,
  ResumeSessionRequest,
  ResumeSessionResponse,
  SetSessionConfigOptionResponse,
  SetSessionModeResponse,
} from '@agentclientprotocol/sdk';
import type {
  DshAcpContentBlock,
  DshAcpInboxSnapshot,
  DshAcpInputCatalogProjection,
  DshAcpPermissionPresetProjection,
  DshAcpCommandExecuteProjection,
  DshAcpSkillInvokeProjection,
} from '@neko/agent-contracts/dsh-acp';

import type { ConversationDshSessionBindingService } from './conversation-dsh-session-binding';
import type { ConversationDshSessionActivation } from './conversation-dsh-session-activation';

export interface ConversationDshSessionAcpClient {
  loadSession(input: Omit<LoadSessionRequest, 'cwd'>): Promise<LoadSessionResponse>;
  resumeSession(input: Omit<ResumeSessionRequest, 'cwd'>): Promise<ResumeSessionResponse>;
  closeSession(sessionId: string): Promise<void>;
  setSessionMode(input: {
    readonly sessionId: string;
    readonly modeId: string;
  }): Promise<SetSessionModeResponse>;
  setSessionConfigOption(input: {
    readonly sessionId: string;
    readonly configId: string;
    readonly value: string;
  }): Promise<SetSessionConfigOptionResponse>;
  prompt(input: PromptRequest): Promise<PromptResponse>;
  cancel(sessionId: string): Promise<void>;
  setSessionContext(input: { readonly sessionId: string; readonly text: string }): Promise<void>;
  readPermissionPresets(sessionId?: string): Promise<DshAcpPermissionPresetProjection>;
  readInputCatalog(sessionId: string): Promise<DshAcpInputCatalogProjection>;
  executeCommand(input: {
    readonly sessionId: string;
    readonly line: string;
  }): Promise<DshAcpCommandExecuteProjection>;
  invokeSkill(input: {
    readonly sessionId: string;
    readonly skillName: string;
    readonly displayText: string;
    readonly args?: string;
  }): Promise<DshAcpSkillInvokeProjection>;
  readInbox(sessionId: string): Promise<DshAcpInboxSnapshot>;
  replaceInboxMessage(input: {
    readonly sessionId: string;
    readonly messageId: string;
    readonly content: readonly DshAcpContentBlock[];
  }): Promise<DshAcpInboxSnapshot>;
  removeInboxMessage(input: {
    readonly sessionId: string;
    readonly messageId: string;
  }): Promise<DshAcpInboxSnapshot>;
}

export interface ConversationDshSessionBoundClient {
  ensureLoaded(conversationId: string): Promise<string>;
  loadSession(
    input: Omit<LoadSessionRequest, 'sessionId' | 'cwd'> & { readonly conversationId: string },
  ): Promise<LoadSessionResponse>;
  resumeSession(
    input: Omit<ResumeSessionRequest, 'sessionId' | 'cwd'> & { readonly conversationId: string },
  ): Promise<ResumeSessionResponse>;
  closeSession(conversationId: string): Promise<void>;
  setSessionMode(conversationId: string, modeId: string): Promise<SetSessionModeResponse>;
  setSessionConfigOption(
    conversationId: string,
    configId: string,
    value: string,
  ): Promise<SetSessionConfigOptionResponse>;
  prompt(
    input: Omit<PromptRequest, 'sessionId'> & { readonly conversationId: string },
  ): Promise<PromptResponse>;
  cancel(conversationId: string): Promise<void>;
  setSessionContext(conversationId: string, text: string): Promise<void>;
  readPermissionPresets(conversationId: string): Promise<DshAcpPermissionPresetProjection>;
  readInputCatalog(conversationId: string): Promise<DshAcpInputCatalogProjection>;
  executeCommand(conversationId: string, line: string): Promise<DshAcpCommandExecuteProjection>;
  invokeSkill(input: {
    readonly conversationId: string;
    readonly skillName: string;
    readonly displayText: string;
    readonly args?: string;
  }): Promise<DshAcpSkillInvokeProjection>;
  readInbox(conversationId: string): Promise<DshAcpInboxSnapshot>;
  replaceInboxMessage(input: {
    readonly conversationId: string;
    readonly messageId: string;
    readonly content: readonly DshAcpContentBlock[];
  }): Promise<DshAcpInboxSnapshot>;
  removeInboxMessage(input: {
    readonly conversationId: string;
    readonly messageId: string;
  }): Promise<DshAcpInboxSnapshot>;
}

export interface ConversationDshSessionBoundClientOptions {
  readonly client: ConversationDshSessionAcpClient;
  readonly binding: ConversationDshSessionBindingService;
  readonly activation?: ConversationDshSessionActivation;
}

export function createConversationDshSessionBoundClient(
  options: ConversationDshSessionBoundClientOptions,
): ConversationDshSessionBoundClient {
  return {
    async ensureLoaded(conversationId) {
      if (options.activation === undefined) {
        return resolveBoundSession(options.binding, conversationId);
      }
      return options.activation.ensureLoaded(conversationId);
    },
    async loadSession({ conversationId, ...request }) {
      const dshSessionId = await resolveBoundSession(options.binding, conversationId);
      const response = await options.client.loadSession({ ...request, sessionId: dshSessionId });
      options.activation?.markLoaded(dshSessionId);
      return response;
    },
    async resumeSession({ conversationId, ...request }) {
      const dshSessionId = await resolveBoundSession(options.binding, conversationId);
      const response = await options.client.resumeSession({ ...request, sessionId: dshSessionId });
      options.activation?.markLoaded(dshSessionId);
      return response;
    },
    async closeSession(conversationId) {
      const dshSessionId = await resolveBoundSession(options.binding, conversationId);
      await options.client.closeSession(dshSessionId);
      options.activation?.markClosed(dshSessionId);
    },
    async setSessionMode(conversationId, modeId) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.setSessionMode({ sessionId: dshSessionId, modeId });
    },
    async setSessionConfigOption(conversationId, configId, value) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.setSessionConfigOption({
        sessionId: dshSessionId,
        configId,
        value,
      });
    },
    async prompt({ conversationId, ...request }) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.prompt({ ...request, sessionId: dshSessionId });
    },
    async cancel(conversationId) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      await options.client.cancel(dshSessionId);
    },
    async setSessionContext(conversationId, text) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      await options.client.setSessionContext({ sessionId: dshSessionId, text });
    },
    async readPermissionPresets(conversationId) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.readPermissionPresets(dshSessionId);
    },
    async readInputCatalog(conversationId) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.readInputCatalog(dshSessionId);
    },
    async executeCommand(conversationId, line) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.executeCommand({ sessionId: dshSessionId, line });
    },
    async invokeSkill({ conversationId, ...request }) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.invokeSkill({ ...request, sessionId: dshSessionId });
    },
    async readInbox(conversationId) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.readInbox(dshSessionId);
    },
    async replaceInboxMessage({ conversationId, ...request }) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.replaceInboxMessage({ ...request, sessionId: dshSessionId });
    },
    async removeInboxMessage({ conversationId, ...request }) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.removeInboxMessage({ ...request, sessionId: dshSessionId });
    },
  };
}

function resolveForOperation(
  options: ConversationDshSessionBoundClientOptions,
  conversationId: string,
): Promise<string> {
  return (
    options.activation?.ensureLoaded(conversationId) ??
    resolveBoundSession(options.binding, conversationId)
  );
}

async function resolveBoundSession(
  binding: ConversationDshSessionBindingService,
  conversationId: string,
): Promise<string> {
  const result = await binding.resolve(conversationId);
  if (!result.ok) {
    throw new Error(`Conversation DSH Session binding failed: ${result.code}: ${result.message}`);
  }
  return result.binding.dshSessionId;
}
