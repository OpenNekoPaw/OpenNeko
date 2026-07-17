import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  StatusBarProjectionManager,
  isStatusBarItemSpecVisible,
  sortStatusBarItemSpecs,
  type StatusBarItemSpec,
} from '../StatusBarGroup';

type MockStatusBarItem = {
  id: string;
  text: string;
  name?: string;
  tooltip?: unknown;
  command?: string;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  statusItems: new Map<string, MockStatusBarItem>(),
  textEditorListeners: [] as Array<() => void>,
  tabListeners: [] as Array<() => void>,
  tabGroupListeners: [] as Array<() => void>,
}));

vi.mock('vscode', () => {
  const alignment = { Left: 1, Right: 2 };

  return {
    StatusBarAlignment: alignment,
    window: {
      createStatusBarItem: vi.fn((id: string) => {
        const item: MockStatusBarItem = {
          id,
          text: '',
          show: vi.fn(),
          hide: vi.fn(),
          dispose: vi.fn(),
        };
        mocks.statusItems.set(id, item);
        return item;
      }),
      onDidChangeActiveTextEditor: vi.fn((listener: () => void) => {
        mocks.textEditorListeners.push(listener);
        return { dispose: vi.fn() };
      }),
      tabGroups: {
        activeTabGroup: { activeTab: undefined },
        onDidChangeTabs: vi.fn((listener: () => void) => {
          mocks.tabListeners.push(listener);
          return { dispose: vi.fn() };
        }),
        onDidChangeTabGroups: vi.fn((listener: () => void) => {
          mocks.tabGroupListeners.push(listener);
          return { dispose: vi.fn() };
        }),
      },
    },
  };
});

describe('StatusBarProjectionManager', () => {
  beforeEach(() => {
    mocks.statusItems.clear();
    mocks.textEditorListeners.length = 0;
    mocks.tabListeners.length = 0;
    mocks.tabGroupListeners.length = 0;
    vi.clearAllMocks();
  });

  it('shows projected items only when the active custom editor matches', () => {
    let activeCustomEditorId: string | null = 'neko.modelEditor';
    const manager = new StatusBarProjectionManager(
      [
        {
          id: 'neko.model.objects',
          alignment: vscode.StatusBarAlignment.Left,
          priority: 10,
          text: '$(symbol-array) 3 objects',
          activeCustomEditorId: 'neko.modelEditor',
          visibilityCondition: 'activeCustomEditorId == neko.modelEditor',
        },
      ],
      {
        resolveActiveSurface: () => ({ activeCustomEditorId }),
      },
    );

    expect(mocks.statusItems.get('neko.model.objects')?.show).toHaveBeenCalledTimes(1);
    expect(mocks.statusItems.get('neko.model.objects')?.hide).not.toHaveBeenCalled();

    activeCustomEditorId = 'neko.canvasEditor';
    mocks.textEditorListeners.forEach((listener) => listener());

    expect(mocks.statusItems.get('neko.model.objects')?.hide).toHaveBeenCalledTimes(1);

    manager.dispose();
  });

  it('refreshes on active tab switching', () => {
    let activeCustomEditorId: string | null = 'neko.canvasEditor';
    const manager = new StatusBarProjectionManager(
      [
        {
          id: 'neko.model.engine',
          alignment: vscode.StatusBarAlignment.Left,
          priority: 8,
          activeCustomEditorId: 'neko.modelEditor',
        },
      ],
      {
        resolveActiveSurface: () => ({ activeCustomEditorId }),
      },
    );

    expect(mocks.statusItems.get('neko.model.engine')?.show).not.toHaveBeenCalled();

    activeCustomEditorId = 'neko.modelEditor';
    mocks.tabListeners.forEach((listener) => listener());
    mocks.tabGroupListeners.forEach((listener) => listener());

    expect(mocks.statusItems.get('neko.model.engine')?.show).toHaveBeenCalledTimes(2);

    manager.dispose();
  });

  it('orders item specs by descending priority', () => {
    const specs: StatusBarItemSpec[] = [
      { id: 'low', alignment: vscode.StatusBarAlignment.Left, priority: 1 },
      { id: 'high', alignment: vscode.StatusBarAlignment.Left, priority: 100 },
      { id: 'middle', alignment: vscode.StatusBarAlignment.Left, priority: 50 },
    ];

    expect(sortStatusBarItemSpecs(specs).map((spec) => spec.id)).toEqual(['high', 'middle', 'low']);
  });

  it('treats visibilityCondition as metadata rather than a programmatic when clause', () => {
    const manager = new StatusBarProjectionManager(
      [
        {
          id: 'neko.model.selected',
          alignment: vscode.StatusBarAlignment.Left,
          priority: 9,
          activeCustomEditorId: 'neko.modelEditor',
          visibilityCondition: 'activeCustomEditorId == neko.modelEditor',
        },
      ],
      {
        resolveActiveSurface: () => ({ activeCustomEditorId: 'neko.modelEditor' }),
      },
    );

    expect(mocks.statusItems.get('neko.model.selected')).not.toHaveProperty('when');
    expect(
      isStatusBarItemSpecVisible(
        {
          id: 'neko.model.selected',
          alignment: vscode.StatusBarAlignment.Left,
          priority: 9,
          activeCustomEditorId: 'neko.modelEditor',
          visibilityCondition: 'activeCustomEditorId == neko.modelEditor',
        },
        { activeCustomEditorId: 'neko.canvasEditor' },
      ),
    ).toBe(false);

    manager.dispose();
  });
});
