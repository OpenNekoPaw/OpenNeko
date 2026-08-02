import type {
  CanvasConnection,
  CanvasNode,
  ConnectionAnchor,
  PortDefinition,
} from '../types/canvas';
import { getDefaultPorts } from '../types/canvas';
import type { CanvasConnectionEndpoint } from '../types/canvas-layered';

export interface CanvasConnectionEndpointResolution {
  nodeId: string;
  portId?: string;
  side: ConnectionAnchor;
}

export function createNodeConnectionEndpoint(nodeId: string): CanvasConnectionEndpoint {
  return { nodeId, scope: 'node' };
}

export function createPortConnectionEndpoint(
  nodeId: string,
  portId: string,
): CanvasConnectionEndpoint {
  return { nodeId, scope: 'port', portId };
}

export function resolveCanvasConnectionEndpoint(
  connection: Pick<CanvasConnection, 'sourceId' | 'targetId' | 'sourceEndpoint' | 'targetEndpoint'>,
  node: CanvasNode,
  end: 'source' | 'target',
): CanvasConnectionEndpointResolution {
  const endpoint = end === 'source' ? connection.sourceEndpoint : connection.targetEndpoint;
  const defaultNodeId = end === 'source' ? connection.sourceId : connection.targetId;
  const nodeId = endpoint.nodeId || defaultNodeId;
  const portId = endpoint.scope === 'port' ? endpoint.portId : undefined;
  const port = portId ? findCanvasNodePort(node, portId) : undefined;

  return {
    nodeId,
    ...(portId ? { portId } : {}),
    side: port?.position ?? getDefaultNodeEndpointSide(end),
  };
}

export function findCanvasNodePort(node: CanvasNode, portId: string): PortDefinition | undefined {
  return (node.ports ?? getDefaultPorts(node.type)).find((port) => port.id === portId);
}

export function getDefaultNodeEndpointSide(end: 'source' | 'target'): ConnectionAnchor {
  return end === 'source' ? 'right' : 'left';
}
