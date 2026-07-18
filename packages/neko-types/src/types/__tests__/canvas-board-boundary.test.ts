import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}

describe('Canvas Board package boundaries', () => {
  it('keeps Agent on public shared/Canvas API contracts', () => {
    const source = read(
      'packages/neko-agent/packages/extension/src/services/workspaceBoardProjectionHost.ts',
    );

    expect(source).toContain("from '@neko/shared'");
    expect(source).toContain("Pick<NekoCanvasAPI, 'boards'>");
    expect(source).not.toMatch(/from ['"].*neko-canvas\/packages/);
    expect(source).not.toMatch(/from ['"].*canvasProjectAuthoringService/);
    expect(source).not.toMatch(/from ['"].*workspaceBoardProjector/);
  });

  it('keeps Canvas Board services independent from Agent runtime internals', () => {
    const source = ['workspaceBoardProjector.ts', 'canvasProjectAuthoringService.ts']
      .map((file) => read(`packages/neko-canvas/packages/extension/src/services/${file}`))
      .join('\n');

    expect(source).not.toMatch(/from ['"]@neko\/agent/);
    expect(source).not.toMatch(/from ['"]@neko-agent/);
    expect(source).not.toMatch(/packages\/neko-agent/);
  });

  it('keeps the replaced Agent coordinator and Canvas Board service paths deleted', () => {
    const deletedPaths = [
      'apps/neko-tui/src/tui/host/node-workspace-board-projector.ts',
      'packages/neko-agent/packages/extension/src/services/agentCanvasBoardCoordinator.ts',
      'packages/neko-canvas/packages/extension/src/services/canvasBoardIndexService.ts',
      'packages/neko-canvas/packages/extension/src/services/canvasBoardResolverService.ts',
      'packages/neko-canvas/packages/extension/src/services/canvasBoardDeliveryService.ts',
      'packages/neko-canvas/packages/extension/src/services/canvasBoardProjection.ts',
    ];

    for (const relativePath of deletedPaths) {
      expect(existsSync(resolve(repositoryRoot, relativePath)), relativePath).toBe(false);
    }
  });

  it('keeps generated-only and direct Canvas Board writer APIs out of Host production paths', () => {
    const tuiHost = read('apps/neko-tui/src/tui/host/node-media-task-delivery-host.ts');
    const vscodeHost = read(
      'packages/neko-agent/packages/extension/src/services/workspaceBoardProjectionHost.ts',
    );

    expect(tuiHost).not.toMatch(/NodeWorkspaceBoardProjector|planCanvasWorkspaceBoardProjection/);
    expect(tuiHost).not.toMatch(/saveNkc|writeFile\([^)]*workspace\.nkc/);
    expect(vscodeHost).not.toMatch(/projectGeneratedAssets|projectGeneratedAsset/);
    expect(vscodeHost).not.toMatch(/status:\s*['"]projected['"][\s\S]{0,200}catch/);
  });
});
