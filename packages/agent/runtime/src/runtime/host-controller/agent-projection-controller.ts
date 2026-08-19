import type { AgentWebviewToHostMessage } from '@neko/agent-contracts';
import type {
  AgentHostRouteEffectContext,
  AgentProjectionControllerEffectPort,
} from './agent-host-controller-contract';
import {
  runAgentHostRouteEffect,
  type AgentHostControllerRouteOperation,
} from './agent-host-route-operation';

export type AgentProjectionControllerRouteOperation = AgentHostControllerRouteOperation;

export function tryHandleAgentProjectionControllerRoute(
  message: AgentWebviewToHostMessage,
  effects: AgentProjectionControllerEffectPort,
  context: AgentHostRouteEffectContext,
): AgentProjectionControllerRouteOperation {
  switch (message.type) {
    case 'projectionEndpointDiscover':
      return runAgentHostRouteEffect(() => effects.discoverEndpoint(message, context));
    case 'projectionAttach':
      return runAgentHostRouteEffect(() => effects.attach(message, context));
    case 'projectionSnapshotAck':
      return runAgentHostRouteEffect(() => effects.acknowledge(message, context));
    case 'projectionDetach':
      return runAgentHostRouteEffect(() => effects.detach(message, context));
    default:
      return null;
  }
}
