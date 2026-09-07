import {
  RESOURCE_BROWSER_ROUTES,
  ResourceBrowserOperationRejectedError,
  createResourceBrowserSearchRequest,
  createResourceBrowserSnapshotRequest,
  parseResourceBrowserIntentRequest,
  type ResourceBrowserDiagnostic,
  type ResourceBrowserIdentity,
  type ResourceBrowserIntentRequest,
  type ResourceBrowserIntentResult,
  type ResourceBrowserProjection,
  type ResourceBrowserSearchRequest,
  type ResourceBrowserSnapshotRequest,
} from '@neko/assets-domain/resource-browser/contract';
import type { DesktopShellProjection } from '@neko/host/desktop-shell-contract';
import type { DesktopWorkbenchLayoutProjection } from '@neko/host/desktop-workbench-contract';

export type WorkspaceQuickCreateKind = 'file' | 'directory' | 'canvas' | 'cut';

export interface DesktopWorkspaceQuickCreationInput {
  readonly requestId: string;
  readonly identity: ResourceBrowserIdentity;
  readonly workbenchInstanceId: string;
  readonly workbench: DesktopWorkbenchLayoutProjection;
  readonly mainGroupId: string;
  readonly kind: WorkspaceQuickCreateKind;
  readonly name: string;
}

export interface DesktopWorkspaceQuickCreationPorts {
  getResourceSnapshot(request: ResourceBrowserSnapshotRequest): Promise<ResourceBrowserProjection>;
  updateWorkbench(
    workbenchInstanceId: string,
    workbench: DesktopWorkbenchLayoutProjection,
  ): Promise<DesktopShellProjection>;
  search(request: ResourceBrowserSearchRequest): Promise<ResourceBrowserProjection>;
  execute(request: ResourceBrowserIntentRequest): Promise<ResourceBrowserIntentResult>;
  getShellSnapshot(): Promise<DesktopShellProjection>;
}

export interface DesktopWorkspaceQuickCreationOutcome {
  readonly projection: DesktopShellProjection;
  readonly createdDocumentId?: string;
  readonly retainedDiagnostic?: ResourceBrowserDiagnostic;
}

export async function executeDesktopWorkspaceQuickCreation(
  input: DesktopWorkspaceQuickCreationInput,
  ports: DesktopWorkspaceQuickCreationPorts,
): Promise<DesktopWorkspaceQuickCreationOutcome> {
  const targetWorkbench = activateWorkspaceMainGroup(input.workbench, input.mainGroupId);
  if (targetWorkbench !== input.workbench) {
    await ports.updateWorkbench(input.workbenchInstanceId, targetWorkbench);
  }

  await ports.getResourceSnapshot(
    createResourceBrowserSnapshotRequest({
      requestId: `${input.requestId}:snapshot`,
      identity: input.identity,
    }),
  );
  await ports.search(
    createResourceBrowserSearchRequest({
      requestId: `${input.requestId}:files`,
      identity: input.identity,
      source: 'files',
      query: '',
    }),
  );
  const request = createWorkspaceQuickCreationRequest(input);
  const result = await ports.execute(request);
  if (result.status === 'rejected') {
    throw new ResourceBrowserOperationRejectedError(result.rejection);
  }
  const retainedDiagnostic = result.projection.diagnostics
    ?.filter((diagnostic) => diagnostic.code === 'creative-document-open-failed')
    .at(-1);
  return {
    projection: await ports.getShellSnapshot(),
    ...(request.route === RESOURCE_BROWSER_ROUTES.createCreativeDocument
      ? { createdDocumentId: request.entryName }
      : {}),
    ...(retainedDiagnostic ? { retainedDiagnostic } : {}),
  };
}

export function activateWorkspaceMainGroup(
  workbench: DesktopWorkbenchLayoutProjection,
  mainGroupId: string,
): DesktopWorkbenchLayoutProjection {
  if (!workbench.main.groups.some((group) => group.groupId === mainGroupId)) {
    throw new Error(`Workspace Main Group '${mainGroupId}' is unavailable.`);
  }
  if (workbench.main.activeGroupId === mainGroupId) return workbench;
  return {
    ...workbench,
    main: {
      ...workbench.main,
      activeGroupId: mainGroupId,
    },
  };
}

export function createWorkspaceQuickCreationRequest(
  input: Pick<DesktopWorkspaceQuickCreationInput, 'requestId' | 'identity' | 'kind' | 'name'>,
): ResourceBrowserIntentRequest {
  if (input.kind === 'canvas' || input.kind === 'cut') {
    const extension = input.kind === 'canvas' ? '.nkc' : '.otio';
    return parseResourceBrowserIntentRequest({
      requestId: input.requestId,
      identity: input.identity,
      route: RESOURCE_BROWSER_ROUTES.createCreativeDocument,
      documentKind: input.kind,
      entryName: appendRequiredExtension(input.name, extension),
    });
  }
  return parseResourceBrowserIntentRequest({
    requestId: input.requestId,
    identity: input.identity,
    route:
      input.kind === 'file'
        ? RESOURCE_BROWSER_ROUTES.createFile
        : RESOURCE_BROWSER_ROUTES.createDirectory,
    entryName: input.name,
  });
}

function appendRequiredExtension(name: string, extension: '.nkc' | '.otio'): string {
  return name.toLocaleLowerCase('en-US').endsWith(extension) ? name : `${name}${extension}`;
}
