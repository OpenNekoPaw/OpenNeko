import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../packages/agent/src/session/types';
import { AgentStreamProcessor } from '../../packages/extension/src/chat/message/agentStreamProcessor';
import {
  createAgentMarkdownSessionKey,
  createAgentMarkdownSessionRegistry,
} from '../../packages/webview/src/markdown/agent-markdown-session-registry';
import { createConversationProjectionStore } from '../../packages/agent/src/runtime/projection/conversation-projection-store';
import { createAgentPoisonPaths } from './poison-paths';
import { createTableHeavyStreamFixture } from './fixtures/table-heavy-stream';
import { createAgentStreamReplayHarness } from './stream-replay-harness';

vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
  },
  window: { showInformationMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

vi.mock('../../packages/extension/src/base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('Agent stream lifecycle performance regression', () => {
  it('keeps the 1,000-chunk Extension/Webview projection path linear and bounded', async () => {
    const fixture = createTableHeavyStreamFixture(1_000);
    const poisonPaths = createAgentPoisonPaths();
    const markdownSessions = createAgentMarkdownSessionRegistry();
    const projection = createConversationProjectionStore('conv-regression');
    markdownSessions.commitProjectionSnapshot(projection.snapshot()).publish();
    let projectionPatches = 0;
    const unsubscribeProjection = projection.subscribe((patch) => {
      projectionPatches += 1;
      markdownSessions.commitProjectionPatch(patch).publish();
      replay.recordWebviewCommit(markdownSessions.metrics().renderRevisions);
    });
    const replay = createAgentStreamReplayHarness({ counters: fixture.counters });
    const conversations = {
      upsertMessageToConversation(): void {},
    };
    const processor = new AgentStreamProcessor({
      conversations: conversations as never,
      getConversationProjection: (conversationId) => {
        expect(conversationId).toBe('conv-regression');
        return projection;
      },
    });

    const result = await processor.processStream(
      replay.webview as never,
      'conv-regression',
      replayEvents(fixture.chunks, replay.recordProviderChunk),
      { messageId: 'message-regression', onPhaseChange: vi.fn() },
    );
    const report = replay.report();
    const snapshot = markdownSessions.getSnapshot(
      createAgentMarkdownSessionKey({
        conversationId: 'conv-regression',
        messageId: 'message-regression',
        itemId: 'text-1',
      }),
    );

    expect(result.accumulatedResponse).toBe(fixture.source);
    expect(snapshot?.source).toBe(fixture.source);
    expect(report.counters.providerChunks).toBe(fixture.chunks.length);
    expect(projection.projectionVersion).toBe(projectionPatches);
    expect(projectionPatches).toBeLessThanOrEqual(fixture.chunks.length + 2);
    expect(report.counters.timelineMessages).toBe(0);
    expect(report.counters.timelinePayloadBytes).toBe(0);
    expect(report.counters.webviewCommits).toBe(projectionPatches);
    expect(report.counters.webviewRenderRevisions).toBe(markdownSessions.metrics().renderRevisions);
    expect(report.counters.persistenceMaxConcurrent).toBe(0);
    expect(report.counters.persistenceConcurrent).toBe(0);
    expect(report.counters.staleWriteDiagnostics).toBe(0);
    expect(result.terminalStatus).toBe('completed');

    poisonPaths.cumulativeTimelineSnapshotPerDelta.assertNotHit();
    poisonPaths.timelineStringPrefixMerge.assertNotHit();
    poisonPaths.perChunkCompactionCheck.assertNotHit();
    poisonPaths.directLegacyMarkdownParse.assertNotHit();
    poisonPaths.concurrentConversationStorageWrite.assertNotHit();

    unsubscribeProjection();
    projection.dispose();
    markdownSessions.disposeAll();
    processor.dispose();
  }, 60_000);
});

async function* replayEvents(
  chunks: readonly string[],
  onChunk: () => void,
): AsyncIterable<AgentEvent> {
  for (const content of chunks) {
    onChunk();
    yield { type: 'text_delta', content };
  }
  yield { type: 'done' };
}
