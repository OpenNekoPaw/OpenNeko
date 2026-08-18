import { describe, expect, it, vi } from 'vitest';
import {
  createCanvasWorkspaceIndexService,
  type CanvasWorkspaceIndexReadPort,
} from './canvas-workspace-index-service';
import {
  createCanvasWorkspaceBoardTarget,
  createExactCanvasTarget,
} from './types/canvas-workspace-context';

describe('Canvas workspace index service', () => {
  it('lists the logical Board first without reading or creating files', async () => {
    const read: CanvasWorkspaceIndexReadPort = {
      listExactCanvasDocuments: vi.fn(async () => []),
      readExactCanvasSummary: vi.fn(async () => ({ canvasId: 'x', name: 'X' })),
    };
    const service = createCanvasWorkspaceIndexService({ read, boardLabel: 'Workspace Board' });

    const catalog = await service.readCatalog('workspace-1');

    expect(catalog.defaultTarget).toEqual(createCanvasWorkspaceBoardTarget('workspace-1'));
    expect(catalog.options[0]).toEqual({
      target: createCanvasWorkspaceBoardTarget('workspace-1'),
      label: 'Workspace Board',
    });
    expect(read.listExactCanvasDocuments).toHaveBeenCalledWith('workspace-1');
    expect(read.readExactCanvasSummary).not.toHaveBeenCalled();
  });

  it('orders exact Canvas identities deterministically regardless of input order', async () => {
    const read: CanvasWorkspaceIndexReadPort = {
      listExactCanvasDocuments: vi.fn(async () => [
        'neko/boards/z.nkc',
        'neko/boards/A.nkc',
        'neko/boards/a.nkc',
        'neko/boards/m.nkc',
      ]),
      readExactCanvasSummary: vi.fn(async (_workspaceId, identity) => ({
        canvasId: identity,
        name: identity,
      })),
    };
    const service = createCanvasWorkspaceIndexService({ read });

    const catalog = await service.readCatalog('workspace-1');

    expect(
      catalog.options
        .slice(1)
        .map((option) =>
          option.target.kind === 'exact-canvas' ? option.target.canvasId : option.label,
        ),
    ).toEqual(['neko/boards/a.nkc', 'neko/boards/A.nkc', 'neko/boards/m.nkc', 'neko/boards/z.nkc']);
  });

  it('keeps a broken exact document disabled while preserving the Board and valid siblings', async () => {
    const read: CanvasWorkspaceIndexReadPort = {
      listExactCanvasDocuments: vi.fn(async () => ['neko/boards/a.nkc', 'neko/boards/b.nkc']),
      readExactCanvasSummary: vi.fn(async (workspaceId, identity) => {
        if (identity === 'neko/boards/a.nkc') throw new Error('bad nkc');
        return {
          canvasId: identity,
          name: 'B',
          nodeTypeSummary: { markdown: 2 },
        };
      }),
    };
    const service = createCanvasWorkspaceIndexService({ read });

    const catalog = await service.readCatalog('workspace-1');

    expect(catalog.options).toHaveLength(3);
    expect(catalog.options[0]).toMatchObject({
      target: createCanvasWorkspaceBoardTarget('workspace-1'),
    });
    expect(catalog.options[1]).toMatchObject({
      target: createExactCanvasTarget('workspace-1', 'neko/boards/a.nkc'),
      disabled: true,
    });
    expect(catalog.options[1]?.diagnostic).toBe('bad nkc');
    expect(catalog.options[2]).toMatchObject({
      target: createExactCanvasTarget('workspace-1', 'neko/boards/b.nkc'),
      label: 'b.nkc',
      summary: {
        canvasId: 'neko/boards/b.nkc',
        name: 'B',
        nodeTypeSummary: { markdown: 2 },
      },
    });
  });

  it('uses the workspace-relative file name instead of the internal Canvas name', async () => {
    const read: CanvasWorkspaceIndexReadPort = {
      listExactCanvasDocuments: vi.fn(async () => ['neko/boards/story.nkc']),
      readExactCanvasSummary: vi.fn(async () => ({
        canvasId: 'neko/boards/story.nkc',
        name: 'Story Canvas',
      })),
    };

    const catalog = await createCanvasWorkspaceIndexService({ read }).readCatalog('workspace-1');

    expect(catalog.options[1]).toMatchObject({
      label: 'story.nkc',
      summary: { name: 'Story Canvas' },
    });
  });

  it('resolves exact Canvas summaries and rejects mismatches without fallback', async () => {
    const read: CanvasWorkspaceIndexReadPort = {
      listExactCanvasDocuments: vi.fn(async () => []),
      readExactCanvasSummary: vi.fn(async () => ({
        canvasId: 'neko/boards/a.nkc',
        name: 'A',
      })),
    };
    const service = createCanvasWorkspaceIndexService({ read });

    await expect(
      service.resolveTurnContext(
        'workspace-1',
        createExactCanvasTarget('workspace-1', 'neko/boards/a.nkc'),
      ),
    ).resolves.toEqual({
      target: createExactCanvasTarget('workspace-1', 'neko/boards/a.nkc'),
      summary: { canvasId: 'neko/boards/a.nkc', name: 'A' },
    });

    await expect(
      service.resolveTurnContext(
        'workspace-1',
        createExactCanvasTarget('workspace-1', 'neko/boards/missing.nkc'),
      ),
    ).rejects.toThrow();
  });

  it('resolves the logical Board without reading files', async () => {
    const read: CanvasWorkspaceIndexReadPort = {
      listExactCanvasDocuments: vi.fn(async () => []),
      readExactCanvasSummary: vi.fn(async () => ({ canvasId: 'x', name: 'X' })),
    };
    const service = createCanvasWorkspaceIndexService({ read });

    await expect(
      service.resolveTurnContext('workspace-1', createCanvasWorkspaceBoardTarget('workspace-1')),
    ).resolves.toEqual({
      target: createCanvasWorkspaceBoardTarget('workspace-1'),
    });
    expect(read.readExactCanvasSummary).not.toHaveBeenCalled();
  });
});
