import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
} from '@neko/agent-contracts/dsh-acp';

export type DshDomainToolEffect = 'read' | 'write';

export function enforceDshDomainToolEffect(
  request: DshAcpDomainToolRequest,
  effect: DshDomainToolEffect,
): DshAcpDomainToolResponse | undefined {
  if (effect !== 'write' || request.sandboxMode !== 'read-only') return undefined;
  return {
    outcome: 'failure',
    diagnostic: {
      code: 'DSH_DOMAIN_TOOL_READ_ONLY',
      message: `DSH sandbox mode 'read-only' does not permit ${request.tool} operation '${request.operation}'.`,
    },
  };
}
