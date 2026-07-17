import type { EditOperation } from '../operations/types';
import type { DecisionRationale } from './decision-rationale';
import {
  CREATIVE_DOMAIN_SERVICE_PORT_IDS,
  type CreativeDomainMetadata,
  type CreativeDomainId,
} from './domain-routing';
import type { Tool } from './tool';

export { createDomainRouter } from './domain-routing';

export type OperationToolDomain =
  | 'timeline'
  | 'canvas'
  | 'sketch'
  | 'audio'
  | 'model'
  | 'puppet'
  | 'project';

export type OperationToolRisk = 'low' | 'medium' | 'high' | 'unknown';

export interface OperationToolIntent {
  readonly id: string;
  readonly domain: OperationToolDomain;
  readonly summary: string;
  readonly rationaleId: string;
  readonly targetIds: readonly string[];
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly risk?: OperationToolRisk;
  readonly requiresUserApproval?: boolean;
  readonly createdAt: number;
}

export interface OperationToolPlan {
  readonly id: string;
  readonly intentId: string;
  readonly rationaleId: string;
  readonly operations: readonly EditOperation[];
  readonly requiresUserApproval: boolean;
  readonly reversible: boolean;
  readonly createdAt: number;
}

export interface OperationToolAdapterContext {
  readonly rationale: DecisionRationale;
  readonly contextPacketId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface IOperationToolAdapter {
  readonly domain: OperationToolDomain;
  canPlan(intent: OperationToolIntent, context: OperationToolAdapterContext): boolean;
  plan(
    intent: OperationToolIntent,
    context: OperationToolAdapterContext,
  ): Promise<OperationToolPlan>;
}

export interface IOperationToolAdapterRegistry {
  register(adapter: IOperationToolAdapter): void;
  unregister(domain: OperationToolDomain): void;
  get(domain: OperationToolDomain): IOperationToolAdapter | undefined;
  list(): readonly IOperationToolAdapter[];
  findPlanner(
    intent: OperationToolIntent,
    context: OperationToolAdapterContext,
  ): IOperationToolAdapter | undefined;
}

export interface OperationToolMetadata {
  readonly kind: 'operation';
  readonly domain: OperationToolDomain;
  readonly creativeDomain?: CreativeDomainMetadata;
  readonly editOperationTypes: readonly EditOperation['type'][];
  readonly requiresRationale: true;
  readonly reversible: boolean;
}

export interface OperationTool extends Tool {
  readonly kind: 'operation';
  readonly operation: OperationToolMetadata;
  readonly perception?: never;
}

export class OperationToolAdapterRegistry implements IOperationToolAdapterRegistry {
  private readonly adapters = new Map<OperationToolDomain, IOperationToolAdapter>();

  register(adapter: IOperationToolAdapter): void {
    this.adapters.set(adapter.domain, adapter);
  }

  unregister(domain: OperationToolDomain): void {
    this.adapters.delete(domain);
  }

  get(domain: OperationToolDomain): IOperationToolAdapter | undefined {
    return this.adapters.get(domain);
  }

  list(): readonly IOperationToolAdapter[] {
    return [...this.adapters.values()];
  }

  findPlanner(
    intent: OperationToolIntent,
    context: OperationToolAdapterContext,
  ): IOperationToolAdapter | undefined {
    const adapter = this.adapters.get(intent.domain);
    if (!adapter || !adapter.canPlan(intent, context)) {
      return undefined;
    }
    return adapter;
  }
}

export function createOperationToolAdapterRegistry(): IOperationToolAdapterRegistry {
  return new OperationToolAdapterRegistry();
}

export function isOperationTool(tool: Tool): tool is OperationTool {
  const operation = (tool as { readonly operation?: unknown }).operation;
  const perception = (tool as { readonly perception?: unknown }).perception;
  if (tool.kind !== 'operation' || perception !== undefined) {
    return false;
  }
  if (typeof operation !== 'object' || operation === null || Array.isArray(operation)) {
    return false;
  }

  const candidate = operation as Record<string, unknown>;
  return candidate['kind'] === 'operation' && candidate['requiresRationale'] === true;
}

export function isOperationToolPlanTraceable(plan: OperationToolPlan): boolean {
  return plan.rationaleId.length > 0 && plan.operations.length > 0;
}

export function mapOperationToolDomainToCreativeDomain(
  domain: OperationToolDomain,
): CreativeDomainId {
  switch (domain) {
    case 'model':
      return 'scene';
    case 'puppet':
      return 'puppet';
    case 'sketch':
      return 'sketch';
    case 'canvas':
      return 'canvas';
    case 'audio':
      return 'audio';
    case 'timeline':
      return 'timeline';
    case 'project':
      return 'project';
  }
}

export function operationToolDomainMetadata(domain: OperationToolDomain): CreativeDomainMetadata {
  const id = mapOperationToolDomainToCreativeDomain(domain);
  return {
    id,
    source: 'operation-tool',
    operationDomain: domain,
    servicePortId: CREATIVE_DOMAIN_SERVICE_PORT_IDS[id],
  };
}

export function getOperationToolCreativeDomain(tool: OperationTool): CreativeDomainMetadata {
  return tool.operation.creativeDomain ?? operationToolDomainMetadata(tool.operation.domain);
}
