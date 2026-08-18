import {
  createCanvasWorkspaceBoardTarget,
  createCanvasWorkspaceContextCatalog,
  createExactCanvasTarget,
  type CanvasWorkspaceContextCatalog,
  type CanvasWorkspaceContextCatalogOption,
  type CanvasWorkspaceTurnContext,
  type CanvasWorkspaceTurnSummary,
  type CanvasWorkspaceTurnTarget,
} from './types/canvas-workspace-context';

export interface CanvasWorkspaceIndexReadPort {
  listExactCanvasDocuments(workspaceId: string): Promise<readonly string[]>;
  readExactCanvasSummary(
    workspaceId: string,
    canvasIdentity: string,
  ): Promise<CanvasWorkspaceTurnSummary>;
}

export interface CanvasWorkspaceIndexServiceOptions {
  readonly read: CanvasWorkspaceIndexReadPort;
  readonly boardLabel?: string;
}

export interface CanvasWorkspaceIndexService {
  readCatalog(workspaceId: string): Promise<CanvasWorkspaceContextCatalog>;
  resolveTurnContext(
    workspaceId: string,
    target: CanvasWorkspaceTurnTarget,
  ): Promise<CanvasWorkspaceTurnContext>;
}

export function createCanvasWorkspaceIndexService(
  options: CanvasWorkspaceIndexServiceOptions,
): CanvasWorkspaceIndexService {
  const boardLabel = options.boardLabel?.trim() || 'Workspace Board';

  return {
    async readCatalog(workspaceId) {
      const boardTarget = createCanvasWorkspaceBoardTarget(workspaceId);
      const diagnostics: string[] = [];
      const identities = await options.read.listExactCanvasDocuments(workspaceId);
      const sortedIdentities = [...identities].sort((left, right) => {
        const primary = left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
        return primary === 0
          ? left.localeCompare(right, 'en', { sensitivity: 'variant' })
          : primary;
      });
      const seen = new Set<string>();
      const optionsList: CanvasWorkspaceContextCatalogOption[] = [
        { target: boardTarget, label: boardLabel },
      ];
      for (const identity of sortedIdentities) {
        if (seen.has(identity)) {
          diagnostics.push(`Duplicate Canvas identity '${identity}' ignored.`);
          continue;
        }
        seen.add(identity);
        try {
          const summary = await options.read.readExactCanvasSummary(workspaceId, identity);
          if (summary.canvasId !== identity) {
            throw new Error(
              `Canvas summary identity '${summary.canvasId ?? ''}' does not match '${identity}'.`,
            );
          }
          optionsList.push({
            target: createExactCanvasTarget(workspaceId, identity),
            label: canvasFileName(identity),
            summary,
          });
        } catch (error) {
          optionsList.push({
            target: createExactCanvasTarget(workspaceId, identity),
            label: identity,
            disabled: true,
            diagnostic: describeError(error),
          });
        }
      }
      return createCanvasWorkspaceContextCatalog({
        workspaceId,
        options: optionsList,
        diagnostics,
      });
    },

    async resolveTurnContext(workspaceId, target) {
      if (target.workspaceId !== workspaceId) {
        throw new Error('Canvas workspace target does not match the requested Workspace.');
      }
      if (target.kind === 'workspace-board') {
        return Object.freeze({ target });
      }
      const summary = await options.read.readExactCanvasSummary(workspaceId, target.canvasId);
      if (summary.canvasId !== target.canvasId) {
        throw new Error('Canvas summary does not match the exact Canvas target.');
      }
      return Object.freeze({ target, summary });
    },
  };
}

function canvasFileName(identity: string): string {
  return identity.split('/').at(-1) ?? identity;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
