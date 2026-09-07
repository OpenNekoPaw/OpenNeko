import path from 'node:path';
import {
  CANVAS_DEFAULT_DOCUMENT_PATH,
  loadNkc,
  projectCanvasWorkspaceTurnSummary,
  type CanvasWorkspaceIndexReadPort,
} from '@neko/canvas-domain';
import type { NekoHostPorts } from '@neko/host/ports';

export interface CanvasWorkspaceIndexNodeAdapterOptions {
  readonly workspaceRoot: string;
  readonly host: Pick<NekoHostPorts, 'files'>;
}

export function createCanvasWorkspaceIndexNodeAdapter(
  options: CanvasWorkspaceIndexNodeAdapterOptions,
): CanvasWorkspaceIndexReadPort {
  const root = path.resolve(options.workspaceRoot);

  return {
    async listExactCanvasDocuments(workspaceId) {
      requireIdentity(workspaceId, 'Workspace');
      const identities: string[] = [];
      await walk(root, '');
      return identities;

      async function walk(directory: string, relativeDirectory: string): Promise<void> {
        const entries = await options.host.files.readDirectory(directory);
        for (const entry of entries) {
          if (entry.type === 'symlink') continue;
          const entryPath = path.resolve(directory, entry.name);
          const relativePath = relativeDirectory
            ? `${relativeDirectory}/${entry.name}`
            : entry.name;
          if (entry.type === 'directory') {
            await walk(entryPath, relativePath);
            continue;
          }
          if (entry.type !== 'file' || entry.name.endsWith('.nkc') === false) continue;
          if (relativePath === CANVAS_DEFAULT_DOCUMENT_PATH) continue;
          identities.push(relativePath);
        }
      }
    },

    async readExactCanvasSummary(workspaceId, canvasIdentity) {
      requireIdentity(workspaceId, 'Workspace');
      const relativePath = requireSafeRelativeIdentity(canvasIdentity);
      const fullPath = path.resolve(root, relativePath);
      assertInside(root, fullPath);
      const stat = await options.host.files.stat(fullPath);
      if (stat.type !== 'file') {
        throw new Error(`Canvas identity '${canvasIdentity}' is not a file.`);
      }
      const loaded = loadNkc(await options.host.files.readText(fullPath));
      if (loaded.validation.valid === false) {
        throw new Error(`Canvas identity '${canvasIdentity}' is not a valid .nkc document.`);
      }
      return projectCanvasWorkspaceTurnSummary({
        canvasId: canvasIdentity,
        name: loaded.data.name,
        nodes: loaded.data.nodes,
      });
    },
  };
}

function requireSafeRelativeIdentity(identity: string): string {
  const trimmed = identity.trim();
  if (trimmed.length === 0 || trimmed.startsWith('/') || trimmed.includes('\\')) {
    throw new Error('Canvas identity must be a non-empty workspace-relative path.');
  }
  const segments = trimmed.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error('Canvas identity must not escape the workspace.');
  }
  return segments.join('/');
}

function assertInside(root: string, fullPath: string): void {
  const relative = path.relative(root, fullPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Canvas identity escapes the authorized workspace.');
  }
}

function requireIdentity(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity is required.`);
  }
  return value;
}
