export const TABLE_HEAVY_STREAM_SOURCE_LENGTH = 5_057;
export const TABLE_HEAVY_STREAM_CHUNK_COUNT = 4_000;

export interface AgentStreamRegressionCounters {
  providerChunks: number;
  timelineMessages: number;
  timelinePayloadBytes: number;
  compactionChecks: number;
  webviewCommits: number;
  webviewRenderRevisions: number;
  persistenceWritesStarted: number;
  persistenceWritesCompleted: number;
  persistenceConcurrent: number;
  persistenceMaxConcurrent: number;
  staleWriteDiagnostics: number;
}

export interface TableHeavyStreamFixture {
  readonly source: string;
  readonly chunks: readonly string[];
  readonly counters: AgentStreamRegressionCounters;
}

/**
 * Reproduces the shape of the reported failure without retaining user content.
 * The source is deliberately table-heavy because GFM table parsing/layout was
 * the most expensive Webview path in the original trace.
 */
export function createTableHeavyStreamFixture(
  chunkCount = TABLE_HEAVY_STREAM_CHUNK_COUNT,
): TableHeavyStreamFixture {
  const source = buildTableHeavySource(TABLE_HEAVY_STREAM_SOURCE_LENGTH);
  const chunks = splitIntoDeterministicChunks(source, chunkCount);

  return {
    source,
    chunks,
    counters: createAgentStreamRegressionCounters(),
  };
}

export function createAgentStreamRegressionCounters(): AgentStreamRegressionCounters {
  return {
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
  };
}

function buildTableHeavySource(targetLength: number): string {
  const header = [
    '# 动画化企划回归样本',
    '',
    '## 镜头规划',
    '',
    '| 镜号 | 时长 | 景别 | 画面 | 动作 | 声音 |',
    '| --- | ---: | --- | --- | --- | --- |',
  ].join('\n');
  const rows: string[] = [];
  let rowIndex = 1;

  while (true) {
    const row = `| ${rowIndex} | ${2 + (rowIndex % 5)}s | ${rowIndex % 2 === 0 ? '中景' : '特写'} | 场景层次与光影变化 ${rowIndex} | 角色动作节拍 ${rowIndex} | 环境声与配乐提示 ${rowIndex} |`;
    const candidate = `${header}\n${rows.concat(row).join('\n')}\n`;
    if (candidate.length > targetLength - 64) {
      break;
    }
    rows.push(row);
    rowIndex += 1;
  }

  const body = `${header}\n${rows.join('\n')}\n\n## 制作备注\n\n`;
  const remaining = targetLength - body.length;
  if (remaining < 0) {
    throw new Error(
      `Table-heavy fixture exceeded target length by ${Math.abs(remaining)} characters`,
    );
  }

  return `${body}${'节奏与连续性检查。'.repeat(Math.ceil(remaining / 9)).slice(0, remaining)}`;
}

function splitIntoDeterministicChunks(source: string, chunkCount: number): readonly string[] {
  if (chunkCount <= 0 || chunkCount > source.length) {
    throw new Error(`Invalid chunk count ${chunkCount} for source length ${source.length}`);
  }

  const chunks: string[] = [];
  for (let index = 0; index < chunkCount - 1; index += 1) {
    chunks.push(source.slice(index, index + 1));
  }
  chunks.push(source.slice(chunkCount - 1));
  return chunks;
}
