import * as vscode from 'vscode';
import type { ProjectSourceAddRequest } from '../../project-file-io/ingest';

export function normalizeVSCodeProjectSourceAddRequest(
  request: ProjectSourceAddRequest,
): ProjectSourceAddRequest {
  if (request.sourcePath || !request.sourceUri) {
    return request;
  }

  const sourcePath = tryReadFileUriPath(request.sourceUri);
  return sourcePath ? { ...request, sourcePath } : request;
}

export function createVSCodeProjectSourceAddRequest(input: {
  readonly requestId: string;
  readonly kind: ProjectSourceAddRequest['kind'];
  readonly formatId: string;
  readonly sourceUri: vscode.Uri;
  readonly role: NonNullable<ProjectSourceAddRequest['target']>['role'];
  readonly destination: ProjectSourceAddRequest['destination'];
  readonly caller: string;
  readonly metadata?: Record<string, unknown>;
  readonly ingestMode?: ProjectSourceAddRequest['ingestMode'];
}): ProjectSourceAddRequest {
  return {
    requestId: input.requestId,
    kind: input.kind,
    formatId: input.formatId,
    sourceUri: input.sourceUri.toString(),
    sourcePath: input.sourceUri.fsPath,
    target: { role: input.role },
    destination: input.destination,
    ingestMode: input.ingestMode ?? 'link',
    caller: input.caller,
    browserFile: {
      name: input.sourceUri.path.split('/').pop() ?? 'source',
    },
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function tryReadFileUriPath(value: string): string | undefined {
  try {
    const uri = vscode.Uri.parse(value);
    return uri.scheme === 'file' ? uri.fsPath : undefined;
  } catch {
    return undefined;
  }
}
