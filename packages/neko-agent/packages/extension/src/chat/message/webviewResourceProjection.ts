import * as vscode from 'vscode';
import { projectMessagesForResourceDisplay, projectResourceValue } from '@neko/agent/runtime';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import {
  createManagedDocumentResourceRef,
  projectDocumentResourceRefsInValue,
  readDocumentArchiveResourceProjection,
} from '@neko/content/document';
import type { DocumentArchiveResourceRef, ResourceRef, ResourceVariantRequest } from '@neko/shared';
import type { ConversationProjectionAttachmentHostFrame, Message } from '@neko-agent/types';
import type { AgentLocalResourceAccess } from '../../services/localResourceAccess';
import { getLogger } from '../../base';

const logger = getLogger('WebviewResourceProjection');

export interface WebviewResourceProjectionOptions {
  readonly webview: vscode.Webview;
  readonly localResourceAccess?: AgentLocalResourceAccess;
  readonly contentAccessRuntime?: AgentContentAccessRuntime;
  readonly localMediaCaller: string;
  readonly documentResourceCaller: string;
  readonly resolveDocumentResourceScope?: () => ResourceRef['scope'];
}

interface AsyncResourceProjector {
  readonly resolveLocalMediaPath: (filePath: string) => string | undefined;
  readonly projectDocumentResourceRef: (
    ref: DocumentArchiveResourceRef,
    variant: ResourceVariantRequest,
  ) => Promise<string | undefined>;
}

export async function projectMessagesForWebviewResourceDisplay(
  messages: readonly Message[],
  options: WebviewResourceProjectionOptions,
): Promise<Message[]> {
  const projector = createWebviewResourceProjector(options);
  const projected = projectMessagesForResourceDisplay(messages, {
    resolveLocalMediaPath: projector.resolveLocalMediaPath,
  });
  const webviewReadyInput = stripDocumentResourceRuntimeFields(projected);
  const withDocumentResources = await projectDocumentResourceRefsInValue(webviewReadyInput, {
    project: (ref, variant) => projector.projectDocumentResourceRef(ref, variant),
    onMissingProjection: appendResourceProjectionDiagnostic,
  });
  return Array.isArray(withDocumentResources) ? (withDocumentResources as Message[]) : projected;
}

/**
 * Projects only render payloads at the Webview attachment boundary. Attachment
 * identity, ordering, diagnostics, and detach frames remain host authoritative.
 */
export async function projectConversationProjectionAttachmentFrameForWebview(
  frame: ConversationProjectionAttachmentHostFrame,
  options: WebviewResourceProjectionOptions,
): Promise<unknown> {
  if (frame.type === 'projectionSnapshot') {
    return {
      ...frame,
      projection: await projectValueForWebviewResourceDisplay(frame.projection, options),
    };
  }
  if (frame.type === 'projectionPatch') {
    return {
      ...frame,
      patch: await projectValueForWebviewResourceDisplay(frame.patch, options),
    };
  }
  return frame;
}

export async function projectValueForWebviewResourceDisplay(
  value: unknown,
  options: WebviewResourceProjectionOptions,
): Promise<unknown> {
  const projector = createWebviewResourceProjector(options);
  const projected = projectResourceValue(value, {
    resolveLocalMediaPath: projector.resolveLocalMediaPath,
  });
  return projectDocumentResourceRefsInValue(stripDocumentResourceRuntimeFields(projected), {
    project: (ref, variant) => projector.projectDocumentResourceRef(ref, variant),
    onMissingProjection: appendResourceProjectionDiagnostic,
  });
}

function createWebviewResourceProjector(
  options: WebviewResourceProjectionOptions,
): AsyncResourceProjector {
  return {
    resolveLocalMediaPath: (filePath) =>
      options.localResourceAccess?.toWebviewUri(
        options.webview,
        filePath,
        options.localMediaCaller,
      ),
    projectDocumentResourceRef: (ref, variant) =>
      projectDocumentResourceRefForWebview(options, ref, variant),
  };
}

async function projectDocumentResourceRefForWebview(
  options: WebviewResourceProjectionOptions,
  ref: DocumentArchiveResourceRef,
  variant: ResourceVariantRequest,
): Promise<string | undefined> {
  if (!options.contentAccessRuntime || !options.localResourceAccess) return undefined;
  const managedRef = createManagedDocumentResourceRef(
    ref,
    options.resolveDocumentResourceScope?.() ?? resolveDefaultDocumentResourceScope(),
  );
  try {
    const result = await options.contentAccessRuntime.loadProviderAsset({
      caller: 'message-resource-projection',
      source: managedRef,
      preferredTarget: 'local-path',
      variant,
    });
    if (result.status !== 'ready' || !result.uri) return undefined;
    return options.localResourceAccess.toWebviewUri(
      options.webview,
      result.uri,
      options.documentResourceCaller,
    );
  } catch (error) {
    logger.warn('Failed to project document resource for Webview display', { error });
    return undefined;
  }
}

function appendResourceProjectionDiagnostic(
  projected: Record<string, unknown>,
  field: string,
): void {
  const diagnostics = Array.isArray(projected['resourceProjectionDiagnostics'])
    ? [...projected['resourceProjectionDiagnostics']]
    : [];
  diagnostics.push({
    code: 'resource-projection-denied',
    severity: 'error',
    field,
    message:
      'Document resource could not be projected for Webview display. Use ResourceRef through unified content access.',
  });
  projected['resourceProjectionDiagnostics'] = diagnostics;
}

function stripDocumentResourceRuntimeFields(value: unknown): unknown {
  return stripDocumentResourceRuntimeFieldsInner(value, new WeakSet<object>());
}

function stripDocumentResourceRuntimeFieldsInner(
  value: unknown,
  visited: WeakSet<object>,
): unknown {
  if (!isObject(value)) return value;
  if (visited.has(value)) return value;
  visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => stripDocumentResourceRuntimeFieldsInner(item, visited));
  }

  if (!isRecord(value)) return value;
  const hasDocumentResource = readDocumentArchiveResourceProjection(value) !== undefined;
  const projected: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (hasDocumentResource && isDocumentResourceRuntimeField(key)) {
      continue;
    }
    projected[key] = stripDocumentResourceRuntimeFieldsInner(child, visited);
  }
  return projected;
}

function isDocumentResourceRuntimeField(key: string): boolean {
  return key === 'renderUri' || key === 'src' || key === 'path';
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && !Array.isArray(value);
}

function resolveDefaultDocumentResourceScope(): ResourceRef['scope'] {
  return vscode.workspace.workspaceFolders?.[0] ? 'project' : 'extension-private';
}
