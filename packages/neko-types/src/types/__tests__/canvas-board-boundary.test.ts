import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}

function readTypeScriptTree(relativePath: string): string {
  const root = resolve(repositoryRoot, relativePath);
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = join(root, entry.name);
      if (entry.isDirectory()) {
        return readTypeScriptTree(absolutePath.slice(repositoryRoot.length + 1));
      }
      return ['.ts', '.tsx'].includes(extname(entry.name))
        ? [readFileSync(absolutePath, 'utf8')]
        : [];
    })
    .join('\n');
}

describe('Canvas Board package boundaries', () => {
  it('keeps durable delivery in the host-neutral Canvas domain', () => {
    const coordinator = read(
      'packages/neko-canvas-domain/src/workspace-board-delivery-coordinator.ts',
    );
    const ledger = read('packages/neko-canvas-domain/src/workspace-board-delivery-ledger.ts');

    expect(coordinator).toContain('export class WorkspaceBoardDeliveryCoordinator');
    expect(ledger).toContain('export class WorkspaceBoardDeliveryLedger');
    expect(`${coordinator}\n${ledger}`).not.toMatch(/from ['"]@neko(?:-agent|\/agent)/);
    expect(`${coordinator}\n${ledger}`).not.toMatch(/from ['"](?:electron|react|vscode)['"]/);
  });

  it('keeps Desktop renderer outside delivery lifecycle ownership', () => {
    const renderer = readTypeScriptTree('apps/neko-desktop/src/renderer');

    expect(renderer).not.toContain('WorkspaceBoardDeliveryLedger');
    expect(renderer).not.toContain('WorkspaceBoardDeliveryCoordinator');
  });

  it('removes the inter-extension Canvas API surface', () => {
    const typesIndex = read('packages/neko-types/src/types/index.ts');

    expect(typesIndex).not.toContain("export * from './extension-api'");
    expect(
      existsSync(resolve(repositoryRoot, 'packages/neko-types/src/types/extension-api.ts')),
    ).toBe(false);
  });

  it('keeps replaced VS Code and TUI delivery paths deleted', () => {
    const deletedPaths = [
      'apps/neko-tui/src/tui/host/node-workspace-board-projector.ts',
      'apps/neko-tui/src/tui/host/node-media-task-delivery-host.ts',
      'packages/neko-agent/packages/extension/src/services/workspaceBoardProjectionHost.ts',
      'packages/neko-agent/packages/extension/src/services/agentCanvasBoardCoordinator.ts',
      'packages/neko-canvas/packages/extension/src/services/canvasBoardDeliveryService.ts',
      'packages/neko-canvas/packages/extension/src/services/canvasBoardProjection.ts',
    ];

    for (const relativePath of deletedPaths) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), relativePath).toBe(false);
    }
  });
});
