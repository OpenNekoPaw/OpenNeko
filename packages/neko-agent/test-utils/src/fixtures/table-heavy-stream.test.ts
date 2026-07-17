import { describe, expect, it } from 'vitest';
import {
  TABLE_HEAVY_STREAM_CHUNK_COUNT,
  TABLE_HEAVY_STREAM_SOURCE_LENGTH,
  createTableHeavyStreamFixture,
} from './table-heavy-stream';

describe('table-heavy Agent stream fixture', () => {
  it('replays the reported source/chunk shape without user content', () => {
    const fixture = createTableHeavyStreamFixture();

    expect(fixture.source).toHaveLength(TABLE_HEAVY_STREAM_SOURCE_LENGTH);
    expect(fixture.chunks).toHaveLength(TABLE_HEAVY_STREAM_CHUNK_COUNT);
    expect(fixture.chunks.join('')).toBe(fixture.source);
    expect(fixture.source).toContain('| 镜号 | 时长 | 景别 | 画面 | 动作 | 声音 |');
    expect(fixture.source.match(/^\| \d+ \|/gm)?.length).toBeGreaterThan(40);
  });

  it('starts with zeroed cross-boundary regression counters', () => {
    const fixture = createTableHeavyStreamFixture();

    expect(fixture.counters).toEqual({
      providerChunks: 0,
      timelineMessages: 0,
      timelinePayloadBytes: 0,
      compactionChecks: 0,
      webviewCommits: 0,
      webviewRenderRevisions: 0,
      persistenceWritesStarted: 0,
      persistenceWritesCompleted: 0,
      persistenceConcurrent: 0,
      persistenceMaxConcurrent: 0,
      staleWriteDiagnostics: 0,
    });
  });
});
