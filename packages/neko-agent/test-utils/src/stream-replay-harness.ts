import type { AgentStreamRegressionCounters } from './fixtures/table-heavy-stream';

export interface AgentStreamReplayMessage {
  readonly type: string;
}

export interface AgentStreamReplayWebview {
  postMessage(message: AgentStreamReplayMessage): Promise<boolean>;
  asWebviewUri(uri: { readonly fsPath?: string; toString?(): string }): { toString(): string };
}

export interface AgentStreamReplayReport {
  readonly counters: Readonly<AgentStreamRegressionCounters>;
  readonly postedMessageTypes: readonly string[];
  readonly timelinePayloadBytesPerMessage: readonly number[];
}

export interface AgentStreamReplayHarness {
  readonly webview: AgentStreamReplayWebview;
  recordProviderChunk(): void;
  recordCompactionChecks(count: number): void;
  recordWebviewCommit(renderRevisionCount: number): void;
  recordPersistenceStart(): void;
  recordPersistenceComplete(): void;
  recordStaleWriteDiagnostic(): void;
  messages(): readonly AgentStreamReplayMessage[];
  report(): AgentStreamReplayReport;
}

/**
 * Non-sensitive probe for the real Extension postMessage boundary. The probe
 * records only message types, byte counts, and lifecycle counters; generated
 * source remains available to the owning test but is excluded from reports.
 */
export function createAgentStreamReplayHarness(input: {
  readonly counters: AgentStreamRegressionCounters;
  readonly onPostMessage?: (message: AgentStreamReplayMessage) => void | Promise<void>;
}): AgentStreamReplayHarness {
  const messages: AgentStreamReplayMessage[] = [];
  const postedMessageTypes: string[] = [];
  const timelinePayloadBytesPerMessage: number[] = [];
  const encoder = new TextEncoder();

  return {
    webview: {
      async postMessage(message): Promise<boolean> {
        messages.push(message);
        postedMessageTypes.push(message.type);
        if (message.type === 'agentTurnTimeline') {
          const bytes = encoder.encode(JSON.stringify(message)).byteLength;
          input.counters.timelineMessages += 1;
          input.counters.timelinePayloadBytes += bytes;
          timelinePayloadBytesPerMessage.push(bytes);
        }
        await input.onPostMessage?.(message);
        return true;
      },
      asWebviewUri(uri): { toString(): string } {
        const value = uri.fsPath ?? uri.toString?.() ?? '<resource>';
        return { toString: () => `webview-replay:${value}` };
      },
    },
    recordProviderChunk(): void {
      input.counters.providerChunks += 1;
    },
    recordCompactionChecks(count): void {
      input.counters.compactionChecks += count;
    },
    recordWebviewCommit(renderRevisionCount): void {
      input.counters.webviewCommits += 1;
      input.counters.webviewRenderRevisions = renderRevisionCount;
    },
    recordPersistenceStart(): void {
      input.counters.persistenceWritesStarted += 1;
      input.counters.persistenceConcurrent += 1;
      input.counters.persistenceMaxConcurrent = Math.max(
        input.counters.persistenceMaxConcurrent,
        input.counters.persistenceConcurrent,
      );
    },
    recordPersistenceComplete(): void {
      input.counters.persistenceWritesCompleted += 1;
      input.counters.persistenceConcurrent -= 1;
      if (input.counters.persistenceConcurrent < 0) {
        throw new Error('Persistence replay counter completed without a matching start.');
      }
    },
    recordStaleWriteDiagnostic(): void {
      input.counters.staleWriteDiagnostics += 1;
    },
    messages(): readonly AgentStreamReplayMessage[] {
      return messages;
    },
    report(): AgentStreamReplayReport {
      return {
        counters: { ...input.counters },
        postedMessageTypes: [...postedMessageTypes],
        timelinePayloadBytesPerMessage: [...timelinePayloadBytesPerMessage],
      };
    },
  };
}
