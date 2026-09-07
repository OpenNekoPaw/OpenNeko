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
  DshAcpInboxEnqueueRequest,
  DshAcpImageAttachmentReadProjection,
  DshAcpInputCatalogProjection,
  DshAcpPermissionPresetProjection,
  DshAcpCommandExecuteProjection,
  DshAcpSkillInvokeProjection,
  DshAcpSessionBranchProjection,
} from '@neko/agent-contracts/dsh-acp';

import type { ConversationDshSessionBindingService } from './conversation-dsh-session-binding';
import type { ConversationDshSessionActivation } from './conversation-dsh-session-activation';

export interface ConversationDshSessionAcpClient {
  loadSession(input: LoadSessionRequest): Promise<LoadSessionResponse>;
  resumeSession(input: ResumeSessionRequest): Promise<ResumeSessionResponse>;
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
  branchSession(input: {
    readonly sessionId: string;
    readonly messageId: string;
  }): Promise<DshAcpSessionBranchProjection>;
  readPermissionPresets(sessionId?: string): Promise<DshAcpPermissionPresetProjection>;
  readInputCatalog(
    input: { readonly sessionId: string } | { readonly cwd: string },
  ): Promise<DshAcpInputCatalogProjection>;
  executeCommand(input: {
    readonly sessionId: string;
    readonly line: string;
  }): Promise<DshAcpCommandExecuteProjection>;
  invokeSkill(input: {
    readonly sessionId: string;
    readonly invocations: readonly { readonly skillName: string }[];
    readonly displayText: string;
    readonly promptText: string;
  }): Promise<DshAcpSkillInvokeProjection>;
  readInbox(sessionId: string): Promise<DshAcpInboxSnapshot>;
  readImageAttachment(input: {
    readonly sessionId: string;
    readonly attachmentId: string;
  }): Promise<DshAcpImageAttachmentReadProjection>;
  enqueueInboxMessage(input: DshAcpInboxEnqueueRequest): Promise<DshAcpInboxSnapshot>;
  replaceInboxMessage(input: {
    readonly sessionId: string;
    readonly messageId: string;
    readonly content: readonly DshAcpContentBlock[];
  }): Promise<DshAcpInboxSnapshot>;
  sendInboxMessageNow(input: {
    readonly sessionId: string;
    readonly messageId: string;
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
    readonly invocations: readonly { readonly skillName: string }[];
    readonly displayText: string;
    readonly promptText: string;
  }): Promise<DshAcpSkillInvokeProjection>;
  readInbox(conversationId: string): Promise<DshAcpInboxSnapshot>;
  readImageAttachment(
    conversationId: string,
    attachmentId: string,
  ): Promise<DshAcpImageAttachmentReadProjection>;
  enqueueInboxMessage(
    input: Omit<DshAcpInboxEnqueueRequest, 'sessionId'> & { readonly conversationId: string },
  ): Promise<DshAcpInboxSnapshot>;
  replaceInboxMessage(input: {
    readonly conversationId: string;
    readonly messageId: string;
    readonly content: readonly DshAcpContentBlock[];
  }): Promise<DshAcpInboxSnapshot>;
  sendInboxMessageNow(input: {
    readonly conversationId: string;
    readonly messageId: string;
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
  readonly resolveCwd: (conversationId: string) => Promise<string>;
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
      const cwd = await options.resolveCwd(conversationId);
      const response = await options.client.loadSession({
        ...request,
        sessionId: dshSessionId,
        cwd,
      });
      options.activation?.markLoaded(dshSessionId);
      return response;
    },
    async resumeSession({ conversationId, ...request }) {
      const dshSessionId = await resolveBoundSession(options.binding, conversationId);
      const cwd = await options.resolveCwd(conversationId);
      const response = await options.client.resumeSession({
        ...request,
        sessionId: dshSessionId,
        cwd,
      });
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
      return options.client.readInputCatalog({ sessionId: dshSessionId });
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
    async readImageAttachment(conversationId, attachmentId) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.readImageAttachment({ sessionId: dshSessionId, attachmentId });
    },
    async enqueueInboxMessage({ conversationId, ...request }) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.enqueueInboxMessage({ ...request, sessionId: dshSessionId });
    },
    async replaceInboxMessage({ conversationId, ...request }) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.replaceInboxMessage({ ...request, sessionId: dshSessionId });
    },
    async sendInboxMessageNow({ conversationId, ...request }) {
      const dshSessionId = await resolveForOperation(options, conversationId);
      return options.client.sendInboxMessageNow({ ...request, sessionId: dshSessionId });
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
