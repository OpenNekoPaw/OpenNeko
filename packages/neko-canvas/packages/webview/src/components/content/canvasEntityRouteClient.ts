import type { CreativeEntityRef } from '@neko/shared';
import { getGlobalVSCodeApi } from '../../utils/vscode';

export interface CanvasEntitySummaryRequest {
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly characterName?: string;
}

export interface CanvasEntityConfirmCandidateRequest {
  readonly candidateId: string;
}

export interface CanvasEntityInspectRequest {
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
}

export interface CanvasEntityRouteResponse {
  readonly ok?: boolean;
  readonly message?: string;
  readonly summary?: {
    readonly status: string;
    readonly displayName: string;
    readonly metadata?: Record<string, string | undefined>;
  };
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
}

let nextRequestId = 0;

export function requestCanvasEntitySummary(
  request: CanvasEntitySummaryRequest,
): Promise<CanvasEntityRouteResponse> {
  return sendCanvasEntityRouteRequest({ type: 'entity.summary', ...request });
}

export function confirmCanvasEntityCandidate(
  request: CanvasEntityConfirmCandidateRequest,
): Promise<CanvasEntityRouteResponse> {
  return sendCanvasEntityRouteRequest({ type: 'entity.confirmCandidate', ...request });
}

export function inspectCanvasEntity(
  request: CanvasEntityInspectRequest,
): Promise<CanvasEntityRouteResponse> {
  return sendCanvasEntityRouteRequest({ type: 'entity.inspect', ...request });
}

function sendCanvasEntityRouteRequest(
  message: Record<string, unknown>,
): Promise<CanvasEntityRouteResponse> {
  const vscode = getGlobalVSCodeApi();
  if (!vscode || typeof window === 'undefined') {
    return Promise.resolve({ ok: false, message: 'VSCode API unavailable.' });
  }
  const requestId = ++nextRequestId;
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      resolve({ ok: false, message: 'Entity route request timed out.' });
    }, 4_000);
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { readonly type?: unknown; readonly _requestId?: unknown };
      if (data.type !== '_response' || data._requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);
      resolve(data as CanvasEntityRouteResponse);
    };
    window.addEventListener('message', handleMessage);
    vscode.postMessage({ ...message, _requestId: requestId });
  });
}
