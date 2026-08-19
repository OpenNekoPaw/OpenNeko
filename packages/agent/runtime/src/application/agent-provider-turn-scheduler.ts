import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Model,
  type Api,
} from '@earendil-works/pi-ai';

import type {
  PiProviderTurnAdmission,
  PiProviderTurnAdmissionInput,
  PiToolRunIdentity,
} from '@neko/agent-runtime/pi';

const APPLICATION_PROVIDER_TURN_LIMIT = 2;

export interface AgentProviderTurnSchedulerSnapshot {
  readonly limit: 2;
  readonly active: readonly PiToolRunIdentity[];
  readonly queued: readonly PiToolRunIdentity[];
}

export interface AgentProviderTurnScheduler extends PiProviderTurnAdmission {
  snapshot(): AgentProviderTurnSchedulerSnapshot;
  dispose(): void;
}

export function createAgentProviderTurnScheduler(): AgentProviderTurnScheduler {
  return new DefaultAgentProviderTurnScheduler();
}

interface ScheduledProviderTurn extends PiProviderTurnAdmissionInput {
  readonly output: AssistantMessageEventStream;
  readonly conversationKey: string;
  readonly abortQueued: () => void;
}

class DefaultAgentProviderTurnScheduler implements AgentProviderTurnScheduler {
  private readonly pending: ScheduledProviderTurn[] = [];
  private readonly activeByConversation = new Map<string, ScheduledProviderTurn>();
  private disposed = false;

  stream(input: PiProviderTurnAdmissionInput): AssistantMessageEventStream {
    const output = createAssistantMessageEventStream();
    if (this.disposed) {
      failProviderTurn(output, input.model, new Error('Agent provider scheduler is disposed.'));
      return output;
    }
    const conversationKey = providerConversationKey(input.identity);
    const scheduled: ScheduledProviderTurn = {
      ...input,
      output,
      conversationKey,
      abortQueued: () => {
        const index = this.pending.indexOf(scheduled);
        if (index < 0) return;
        this.pending.splice(index, 1);
        failProviderTurn(
          output,
          input.model,
          input.signal?.reason ?? new Error('Queued Agent provider turn was cancelled.'),
          true,
        );
        this.drain();
      },
    };
    if (input.signal?.aborted === true) {
      scheduled.abortQueued();
      failProviderTurn(
        output,
        input.model,
        input.signal.reason ?? new Error('Agent provider turn was cancelled before admission.'),
        true,
      );
      return output;
    }
    this.pending.push(scheduled);
    input.signal?.addEventListener('abort', scheduled.abortQueued, { once: true });
    this.drain();
    return output;
  }

  snapshot(): AgentProviderTurnSchedulerSnapshot {
    return Object.freeze({
      limit: APPLICATION_PROVIDER_TURN_LIMIT,
      active: Object.freeze(
        [...this.activeByConversation.values()].map((scheduled) => scheduled.identity),
      ),
      queued: Object.freeze(this.pending.map((scheduled) => scheduled.identity)),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const scheduled of this.pending.splice(0)) {
      scheduled.signal?.removeEventListener('abort', scheduled.abortQueued);
      failProviderTurn(
        scheduled.output,
        scheduled.model,
        new Error('Agent provider scheduler disposed before queued admission.'),
        true,
      );
    }
    if (this.activeByConversation.size > 0) {
      throw new Error('Agent provider scheduler disposed while provider turns remain active.');
    }
  }

  private drain(): void {
    while (this.activeByConversation.size < APPLICATION_PROVIDER_TURN_LIMIT) {
      const index = this.pending.findIndex(
        (scheduled) => !this.activeByConversation.has(scheduled.conversationKey),
      );
      if (index < 0) return;
      const scheduled = this.pending.splice(index, 1)[0];
      if (!scheduled) throw new Error('Agent provider scheduler queue invariant failed.');
      scheduled.signal?.removeEventListener('abort', scheduled.abortQueued);
      if (scheduled.signal?.aborted === true) {
        failProviderTurn(
          scheduled.output,
          scheduled.model,
          scheduled.signal.reason ?? new Error('Queued Agent provider turn was cancelled.'),
          true,
        );
        continue;
      }
      this.activeByConversation.set(scheduled.conversationKey, scheduled);
      this.forward(scheduled);
    }
  }

  private forward(scheduled: ScheduledProviderTurn): void {
    void (async () => {
      try {
        const source = scheduled.start();
        for await (const event of source) scheduled.output.push(event);
        scheduled.output.end();
      } catch (error) {
        failProviderTurn(scheduled.output, scheduled.model, error);
      } finally {
        if (this.activeByConversation.get(scheduled.conversationKey) === scheduled) {
          this.activeByConversation.delete(scheduled.conversationKey);
        }
        this.drain();
      }
    })();
  }
}

function providerConversationKey(identity: PiToolRunIdentity): string {
  return JSON.stringify([identity.workspaceId, identity.conversationId]);
}

function failProviderTurn(
  output: AssistantMessageEventStream,
  model: Model<Api>,
  error: unknown,
  aborted = false,
): void {
  const detail = error instanceof Error ? error.message : String(error);
  const message: AssistantMessage = {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: aborted ? 'aborted' : 'error',
    errorMessage: `Agent provider turn was ${aborted ? 'cancelled' : 'not admitted'}: ${detail}`,
    timestamp: Date.now(),
  };
  output.push({ type: 'error', reason: aborted ? 'aborted' : 'error', error: message });
  output.end();
}
