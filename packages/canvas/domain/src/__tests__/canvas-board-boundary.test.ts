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
    const coordinator = read('packages/canvas/domain/src/workspace-board-delivery-coordinator.ts');
    const ledger = read('packages/canvas/domain/src/workspace-board-delivery-ledger.ts');

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
    const sharedIndex = read('packages/shared/src/index.ts');

    expect(sharedIndex).not.toContain('extension-api');
    expect(existsSync(resolve(repositoryRoot, 'packages/shared/src/types'))).toBe(false);
    expect(existsSync(resolve(repositoryRoot, 'packages/shared/src/types/extension-api.ts'))).toBe(
      false,
    );
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

  it('keeps retired structured storyboard ownership out of Canvas Domain', () => {
    const deletedPaths = [
      'packages/canvas/domain/src/canvas-cut-draft.ts',
      'packages/canvas/domain/src/canvas-semantic-storyboard.ts',
      'packages/canvas/domain/src/types/storyboard-table.ts',
      'packages/canvas/domain/src/types/creative-table-profile.ts',
    ];

    for (const relativePath of deletedPaths) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), relativePath).toBe(false);
    }

    const publicEntries = [
      read('packages/canvas/domain/src/index.ts'),
      read('packages/canvas/domain/src/types/index.ts'),
    ].join('\n');
    expect(publicEntries).not.toMatch(
      /canvas-cut-draft|canvas-semantic-storyboard|storyboard-table|creative-table-profile/,
    );

    const authoringContracts = read(
      'packages/canvas/domain/src/types/canvas-authoring-contracts.ts',
    );
    expect(authoringContracts).not.toMatch(
      /CanvasAuthoring(?:Catalog|FieldProfile|SemanticPrompt|Recipe|Operation|ResultEnvelope)/,
    );
  });
});
