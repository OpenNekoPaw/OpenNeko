import { describe, expect, it, vi } from 'vitest';
import {
  createCanvasWorkspaceIndexService,
  type CanvasWorkspaceIndexReadPort,
} from './canvas-workspace-index-service';
import {
  createDefaultCanvasWorkspaceTarget,
  createCanvasWorkspaceTarget,
} from './types/canvas-workspace-context';

describe('Canvas workspace index service', () => {
  it('lists the default Canvas first without reading or creating files', async () => {
    const read: CanvasWorkspaceIndexReadPort = {
      listExactCanvasDocuments: vi.fn(async () => []),
      readExactCanvasSummary: vi.fn(async () => ({ canvasId: 'x', name: 'X' })),
    };
    const service = createCanvasWorkspaceIndexService({ read });

    const catalog = await service.readCatalog('workspace-1');

    expect(catalog.defaultTarget).toEqual(createDefaultCanvasWorkspaceTarget('workspace-1'));
    expect(catalog.options[0]).toEqual({
      target: createDefaultCanvasWorkspaceTarget('workspace-1'),
      label: 'workspace.nkc',
    });
    expect(read.listExactCanvasDocuments).toHaveBeenCalledWith('workspace-1');
    expect(read.readExactCanvasSummary).not.toHaveBeenCalled();
  });

  it('keeps a broken document disabled while preserving the default and valid siblings', async () => {
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
      target: createDefaultCanvasWorkspaceTarget('workspace-1'),
    });
    expect(catalog.options[1]).toMatchObject({
      target: createCanvasWorkspaceTarget('workspace-1', 'neko/boards/a.nkc'),
      disabled: true,
    });
    expect(catalog.options[1]?.diagnostic).toBe('bad nkc');
    expect(catalog.options[2]).toMatchObject({
      target: createCanvasWorkspaceTarget('workspace-1', 'neko/boards/b.nkc'),
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
        createCanvasWorkspaceTarget('workspace-1', 'neko/boards/a.nkc'),
      ),
    ).resolves.toEqual({
      target: createCanvasWorkspaceTarget('workspace-1', 'neko/boards/a.nkc'),
      summary: { canvasId: 'neko/boards/a.nkc', name: 'A' },
    });

    await expect(
      service.resolveTurnContext(
        'workspace-1',
        createCanvasWorkspaceTarget('workspace-1', 'neko/boards/missing.nkc'),
      ),
    ).rejects.toThrow();
  });

  it('resolves the default Canvas without reading files', async () => {
    const read: CanvasWorkspaceIndexReadPort = {
      listExactCanvasDocuments: vi.fn(async () => []),
      readExactCanvasSummary: vi.fn(async () => ({ canvasId: 'x', name: 'X' })),
    };
    const service = createCanvasWorkspaceIndexService({ read });

    await expect(
      service.resolveTurnContext('workspace-1', createDefaultCanvasWorkspaceTarget('workspace-1')),
    ).resolves.toEqual({
      target: createDefaultCanvasWorkspaceTarget('workspace-1'),
    });
    expect(read.readExactCanvasSummary).not.toHaveBeenCalled();
  });
});
