import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  TOOL_NAMES_SYSTEM,
  type ProjectSemanticCoverageResult,
  type ToolResult,
} from '@neko/shared';
import { PROJECT_SEARCH_SEMANTIC_COVERAGE_COMMAND } from '@neko/search/host-vscode';
import {
  createSemanticCoverageTool,
  executeSemanticCoverageQuery,
  planSemanticCoverageRanges,
} from '../semanticCoverageTool';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

describe('semantic coverage tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a read-only host facade tool', () => {
    const tool = createSemanticCoverageTool();

    expect(tool.name).toBe(TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE);
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.isConcurrencySafe).toBe(true);
  });

  it('reuses fresh ranges and schedules missing or stale ranges for normal analysis', async () => {
    const result = makeCoverageResult({
      coverage: 'partial',
      freshness: 'partial',
      matchedRanges: [
        {
          coverage: 'fresh',
          freshness: 'fresh',
          range: { startLine: 1, endLine: 10 },
          segmentIds: ['segment-1'],
        },
        {
          coverage: 'stale',
          freshness: 'stale',
          range: { startLine: 11, endLine: 20 },
          staleReasons: ['provider-version'],
        },
      ],
      staleReasons: ['provider-version'],
    });
    vi.mocked(vscode.commands.executeCommand).mockResolvedValueOnce(result);

    const toolResult = (await executeSemanticCoverageQuery(makeQuery())) as ToolResult;

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      PROJECT_SEARCH_SEMANTIC_COVERAGE_COMMAND,
      expect.objectContaining({ analysisKind: 'ocr' }),
    );
    expect(toolResult.success).toBe(true);
    expect(toolResult.data).toEqual(
      expect.objectContaining({
        coverage: 'partial',
        planning: {
          reusableRanges: [{ startLine: 1, endLine: 10 }],
          analyzeRanges: [{ startLine: 11, endLine: 20 }],
        },
      }),
    );
  });

  it('falls back clearly when source refs are missing', async () => {
    const toolResult = (await executeSemanticCoverageQuery({
      analysisKind: 'ocr',
      range: { startLine: 1, endLine: 10 },
    })) as ToolResult;

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    expect(toolResult).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          coverage: 'failed',
          planning: {
            reusableRanges: [],
            analyzeRanges: [{ startLine: 1, endLine: 10 }],
            fallback: 'normal-tool-analysis',
          },
        }),
      }),
    );
  });

  it('does not mutate confirmed entities or accepted observations', async () => {
    vi.mocked(vscode.commands.executeCommand).mockResolvedValueOnce(
      makeCoverageResult({
        coverage: 'fresh',
        freshness: 'fresh',
        matchedRanges: [
          {
            coverage: 'fresh',
            freshness: 'fresh',
            observationIds: ['obs-accepted-1'],
            segmentIds: ['segment-1'],
          },
        ],
      }),
    );

    const toolResult = (await executeSemanticCoverageQuery(makeQuery())) as ToolResult;

    expect(toolResult.success).toBe(true);
    expect(JSON.stringify(toolResult.data)).not.toContain('reviewStatus');
    expect(JSON.stringify(toolResult.data)).not.toContain('entityRef');
    expect(JSON.stringify(toolResult.data)).not.toContain('confirmed');
  });

  it('plans all requested range for analysis when coverage has no matched ranges', () => {
    const plan = planSemanticCoverageRanges(
      makeCoverageResult({
        coverage: 'missing',
        freshness: 'stale',
        staleReasons: ['missing-provider'],
      }),
    );

    expect(plan).toEqual({
      reusableRanges: [],
      analyzeRanges: [{ startLine: 1, endLine: 20 }],
      fallback: 'normal-tool-analysis',
    });
  });
});

function makeQuery() {
  return {
    sourceRef: {
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
    },
    range: { startLine: 1, endLine: 20 },
    analysisKind: 'ocr',
    skillId: 'storyboard',
  };
}

function makeCoverageResult(
  overrides: Omit<ProjectSemanticCoverageResult, 'query'>,
): ProjectSemanticCoverageResult {
  return {
    query: makeQuery(),
    ...overrides,
  };
}
