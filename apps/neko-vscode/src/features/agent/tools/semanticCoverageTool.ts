import * as vscode from 'vscode';
import {
  TOOL_NAMES_SYSTEM,
  createTool,
  isProjectSemanticCoverageQuery,
  isProjectSemanticCoverageResult,
  validateProjectSemanticCoverageQuery,
  type ProjectSemanticCoverageResult,
  type Tool,
  type ToolResult,
} from '@neko/shared';
import { PROJECT_SEARCH_SEMANTIC_COVERAGE_COMMAND } from '@neko/search/host-vscode';

export function createSemanticCoverageTool(): Tool {
  return createTool({
    name: TOOL_NAMES_SYSTEM.QUERY_SEMANTIC_COVERAGE,
    description:
      'Query host-managed semantic coverage for a stable source reference and optional range before long document, comic, video, or audio analysis. Returns freshness, matched ranges, stale reasons, and diagnostics without exposing cache files.',
    category: 'analysis',
    isReadOnly: true,
    isConcurrencySafe: true,
    parameters: {
      type: 'object',
      properties: {
        sourceRef: {
          type: 'object',
          description:
            'Stable content source reference. Runtime refs and cache paths are rejected.',
        },
        range: {
          type: 'object',
          description: 'Optional range using the shared MediaTextRange fields.',
        },
        analysisKind: {
          type: 'string',
          enum: [
            'ocr',
            'asr',
            'subtitle',
            'vision',
            'entity-mention',
            'character-observation',
            'storyboard',
          ],
        },
        skillId: { type: 'string' },
        skillVersion: { type: 'string' },
        providerId: { type: 'string' },
        schemaVersion: { type: 'string' },
        projectRoot: { type: 'string' },
        contextFilePath: { type: 'string' },
        contextUri: { type: 'string' },
      },
      required: ['sourceRef', 'analysisKind'],
    },
    execute: async (args) => executeSemanticCoverageQuery(args),
  });
}

export async function executeSemanticCoverageQuery(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const queryCandidate = readSemanticCoverageQuery(args);
  const queryDiagnostics = validateProjectSemanticCoverageQuery(queryCandidate);
  if (queryDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      success: true,
      data: {
        coverage: 'failed',
        freshness: 'failed',
        diagnostics: queryDiagnostics,
        planning: {
          reusableRanges: [],
          analyzeRanges: [readRangeForDiagnostic(args['range'])],
          fallback: 'normal-tool-analysis',
        },
      },
    };
  }
  if (!isProjectSemanticCoverageQuery(queryCandidate)) {
    return {
      success: true,
      data: {
        coverage: 'failed',
        freshness: 'failed',
        diagnostics: queryDiagnostics,
        planning: {
          reusableRanges: [],
          analyzeRanges: [readRangeForDiagnostic(args['range'])],
          fallback: 'normal-tool-analysis',
        },
      },
    };
  }
  const query = queryCandidate;

  const result = await vscode.commands.executeCommand(
    PROJECT_SEARCH_SEMANTIC_COVERAGE_COMMAND,
    query,
  );
  if (!isProjectSemanticCoverageResult(result)) {
    return {
      success: true,
      data: {
        query,
        coverage: 'failed',
        freshness: 'failed',
        diagnostics: [
          {
            severity: 'warning',
            code: 'semantic-coverage-invalid-host-result',
            message: 'Semantic coverage facade returned an invalid result.',
          },
        ],
        planning: {
          reusableRanges: [],
          analyzeRanges: [query.range ?? {}],
          fallback: 'normal-tool-analysis',
        },
      },
    };
  }

  return {
    success: true,
    data: {
      ...result,
      planning: planSemanticCoverageRanges(result),
    },
  };
}

export function planSemanticCoverageRanges(result: ProjectSemanticCoverageResult): {
  readonly reusableRanges: readonly unknown[];
  readonly analyzeRanges: readonly unknown[];
  readonly fallback?: 'normal-tool-analysis';
} {
  const ranges = result.matchedRanges ?? [];
  const reusableRanges = ranges
    .filter((range) => range.coverage === 'fresh' && range.freshness === 'fresh')
    .map((range) => range.range ?? {});
  const analyzeRanges = ranges
    .filter((range) => range.coverage !== 'fresh' || range.freshness !== 'fresh')
    .map((range) => range.range ?? {})
    .concat(ranges.length === 0 && result.query.range ? [result.query.range] : []);
  return {
    reusableRanges,
    analyzeRanges,
    ...(result.coverage === 'missing' || result.coverage === 'failed'
      ? { fallback: 'normal-tool-analysis' as const }
      : {}),
  };
}

function readRangeForDiagnostic(value: unknown): unknown {
  return typeof value === 'object' && value !== null ? value : {};
}

function readSemanticCoverageQuery(args: Record<string, unknown>): unknown {
  return {
    sourceRef: args['sourceRef'],
    ...(args['range'] !== undefined ? { range: args['range'] } : {}),
    analysisKind: args['analysisKind'],
    ...(typeof args['skillId'] === 'string' ? { skillId: args['skillId'] } : {}),
    ...(typeof args['skillVersion'] === 'string' ? { skillVersion: args['skillVersion'] } : {}),
    ...(typeof args['providerId'] === 'string' ? { providerId: args['providerId'] } : {}),
    ...(typeof args['schemaVersion'] === 'string' ? { schemaVersion: args['schemaVersion'] } : {}),
    ...(typeof args['projectRoot'] === 'string' ? { projectRoot: args['projectRoot'] } : {}),
    ...(typeof args['contextFilePath'] === 'string'
      ? { contextFilePath: args['contextFilePath'] }
      : {}),
    ...(typeof args['contextUri'] === 'string' ? { contextUri: args['contextUri'] } : {}),
  };
}
