import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
  DshAcpJsonValue,
} from '@neko/agent-contracts/dsh-acp';
import {
  CUT_DSH_TOOL_NAME,
  CutProjectAuthoringError,
  projectCutDshExportFacts,
  type CutProjectAuthoringService,
  decodeCutDshToolInput,
  projectCutDshToolFacts,
} from '@neko/cut-domain';
import type { CutExportTaskSnapshot } from '@neko/cut-domain';

type CutAuthoringPort = Pick<CutProjectAuthoringService, 'query' | 'apply'>;
interface CutExportPort {
  submit(input: {
    readonly documentPath: string;
    readonly sessionId: string;
    readonly outputWorkspaceRelativePath: string;
    readonly settings: import('@neko/cut-domain').CutExportSettings;
    readonly signal?: AbortSignal;
  }): Promise<CutExportTaskSnapshot>;
  describe(input: {
    readonly documentPath: string;
    readonly jobId: string;
  }): Promise<CutExportTaskSnapshot>;
  cancel(input: {
    readonly documentPath: string;
    readonly jobId: string;
  }): Promise<CutExportTaskSnapshot>;
}
type CutDshService = CutAuthoringPort & Partial<CutExportPort>;

export class CutDshHostAdapter {
  private readonly toolName: string;

  constructor(
    private readonly service: CutDshService | (() => Promise<CutDshService>),
    toolName: string = CUT_DSH_TOOL_NAME,
  ) {
    if (toolName !== CUT_DSH_TOOL_NAME) {
      throw new Error(`Cut Host adapter must use exactly ${CUT_DSH_TOOL_NAME}.`);
    }
    this.toolName = toolName;
  }

  async execute(
    request: DshAcpDomainToolRequest,
    signal?: AbortSignal,
  ): Promise<DshAcpDomainToolResponse> {
    signal?.throwIfAborted();
    if (request.tool !== this.toolName) {
      return failure(
        'CUT_DSH_TOOL_MISMATCH',
        `Expected ${this.toolName}, received ${request.tool}.`,
      );
    }
    let decoded;
    try {
      decoded = decodeCutDshToolInput(request.operation, request.input);
    } catch (error) {
      return failure('CUT_DSH_TOOL_INVALID_INPUT', errorMessage(error));
    }
    try {
      const service = typeof this.service === 'function' ? await this.service() : this.service;
      if (decoded.operation === 'query') {
        const snapshot = await service.query({
          documentPath: decoded.input.documentPath,
          ...(signal === undefined ? {} : { signal }),
        });
        return { outcome: 'success', result: toJsonValue(projectCutDshToolFacts(snapshot)) };
      }
      if (decoded.operation === 'apply') {
        const current = await service.query({
          documentPath: decoded.input.documentPath,
          ...(signal === undefined ? {} : { signal }),
        });
        const snapshot = await service.apply({
          documentPath: decoded.input.documentPath,
          expectedFingerprint: current.fingerprint,
          commands: decoded.input.commands,
          ...(signal === undefined ? {} : { signal }),
        });
        return { outcome: 'success', result: toJsonValue(projectCutDshToolFacts(snapshot)) };
      }
      if (
        service.submit === undefined ||
        service.describe === undefined ||
        service.cancel === undefined
      ) {
        throw Object.assign(new Error('Cut export Job owner is unavailable for this Workspace.'), {
          code: 'CUT_DSH_EXPORT_OWNER_MISSING',
        });
      }
      const task: CutExportTaskSnapshot =
        decoded.operation === 'export-submit'
          ? await service.submit({
              documentPath: decoded.input.documentPath,
              sessionId: decoded.input.sessionId,
              outputWorkspaceRelativePath: decoded.input.outputWorkspaceRelativePath,
              settings: decoded.input.settings,
              ...(signal === undefined ? {} : { signal }),
            })
          : decoded.operation === 'export-describe'
            ? await service.describe(decoded.input)
            : await service.cancel(decoded.input);
      const facts = projectCutDshExportFacts(task);
      return {
        outcome: 'success',
        result: toJsonValue(facts),
        jobId: task.jobId,
      };
    } catch (error) {
      return failure(toCutDiagnostic(error), errorMessage(error));
    }
  }
}

function toJsonValue(value: unknown): DshAcpJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)]),
    );
  }
  throw new Error('Cut DSH Tool result must be lossless JSON.');
}

function toCutDiagnostic(error: unknown): string {
  if (error instanceof CutProjectAuthoringError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : 'CUT_DSH_TOOL_FAILED';
  }
  return 'CUT_DSH_TOOL_FAILED';
}

function failure(code: string, message: string): DshAcpDomainToolResponse {
  return { outcome: 'failure', diagnostic: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
