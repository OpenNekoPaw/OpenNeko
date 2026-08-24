import {
  CREATE_SKILL_DSH_TOOL_NAME,
  CREATE_SKILL_DSH_TOOL_OPERATION,
  decodeCreateDshSkillInput,
} from '@neko/agent-contracts/dsh-skill-authoring';
import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
} from '@neko/agent-contracts/dsh-acp';
import type { DshSkillAuthoringService } from '../application/dsh-skill-authoring';
import type { DshDomainToolContextResolver } from '../application/dsh-domain-tool-context-resolver';

export class SkillAuthoringDshHostAdapter {
  constructor(
    private readonly options: {
      readonly contexts: DshDomainToolContextResolver;
      readonly service: Pick<DshSkillAuthoringService, 'create'>;
    },
  ) {}

  async execute(
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ): Promise<DshAcpDomainToolResponse> {
    try {
      if (request.tool !== CREATE_SKILL_DSH_TOOL_NAME) {
        return failure('SKILL_AUTHORING_TOOL_INVALID', 'Skill authoring Tool identity is invalid.');
      }
      if (request.operation !== CREATE_SKILL_DSH_TOOL_OPERATION) {
        return failure(
          'SKILL_AUTHORING_OPERATION_INVALID',
          `Unsupported Skill authoring operation '${request.operation}'.`,
        );
      }
      if (request.sandboxMode === 'read-only') {
        return failure(
          'SKILL_AUTHORING_WRITE_DENIED',
          'CreateSkill requires a writable DSH permission preset.',
        );
      }
      signal.throwIfAborted();
      const context = await this.options.contexts.resolve(request.sessionId);
      const result = await this.options.service.create({
        sessionId: request.sessionId,
        context: context.binding,
        package: decodeCreateDshSkillInput(request.input),
        signal,
      });
      return { outcome: 'success', result };
    } catch (error) {
      return failure(
        readErrorCode(error) ?? 'SKILL_AUTHORING_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

function failure(code: string, message: string): DshAcpDomainToolResponse {
  return { outcome: 'failure', diagnostic: { code, message } };
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' && error.code.length > 0 ? error.code : undefined;
}
