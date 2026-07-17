import * as vscode from 'vscode';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StatusBarItemConfig {
  /** Unique identifier, e.g. 'neko.audio.duration' */
  id: string;
  alignment: vscode.StatusBarAlignment;
  priority: number;
  name?: string;
  tooltip?: string | vscode.MarkdownString;
  command?: string;
  /**
   * 'always' — shown/hidden together with the group (default).
   * 'conditional' — hidden by default; use setVisible() to control.
   */
  visible?: 'always' | 'conditional';
}

export interface StatusBarActiveSurface {
  activeCustomEditorId?: string | null;
}

export interface StatusBarItemSpec extends Omit<StatusBarItemConfig, 'visible'> {
  /**
   * Initial text for projected items. Call update() later when the source state changes.
   */
  text?: string;
  /**
   * Readable business metadata, e.g. "activeCustomEditorId == neko.modelEditor".
   * Programmatic StatusBarItems do not receive this as a VSCode `when` clause.
   */
  visibilityCondition?: string;
  /**
   * Extension-side visibility selector used by StatusBarProjectionManager.
   */
  activeCustomEditorId?: string;
}

export interface StatusBarProjectionManagerOptions {
  resolveActiveSurface?: () => StatusBarActiveSurface;
  autoSubscribe?: boolean;
}

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Manages a group of VSCode StatusBarItems with unified lifecycle.
 *
 * Usage:
 * ```ts
 * const bar = new StatusBarGroup([
 *   { id: 'neko.audio.duration', alignment: Left, priority: 100, name: 'Duration' },
 *   { id: 'neko.audio.codec',    alignment: Left, priority: 99,  name: 'Codec' },
 *   { id: 'neko.audio.selection', alignment: Left, priority: 98,  visible: 'conditional' },
 * ]);
 *
 * bar.update('neko.audio.duration', '$(clock) 3:45');
 * bar.show();
 * bar.setVisible('neko.audio.selection', true);
 * // ...
 * bar.dispose();
 * ```
 */
export class StatusBarGroup implements vscode.Disposable {
  private readonly items = new Map<string, vscode.StatusBarItem>();
  private readonly alwaysIds: string[] = [];
  private isShown = false;

  constructor(configs: StatusBarItemConfig[]) {
    for (const cfg of configs) {
      const item = vscode.window.createStatusBarItem(cfg.id, cfg.alignment, cfg.priority);
      if (cfg.name) item.name = cfg.name;
      if (cfg.tooltip) item.tooltip = cfg.tooltip;
      if (cfg.command) item.command = cfg.command;
      this.items.set(cfg.id, item);

      if (cfg.visible !== 'conditional') {
        this.alwaysIds.push(cfg.id);
      }
    }
  }

  /** Retrieve an item by id for direct manipulation. */
  get(id: string): vscode.StatusBarItem | undefined {
    return this.items.get(id);
  }

  /** Show all 'always' items. */
  show(): void {
    this.isShown = true;
    for (const id of this.alwaysIds) {
      this.items.get(id)?.show();
    }
  }

  /** Hide all items (both 'always' and 'conditional'). */
  hide(): void {
    this.isShown = false;
    this.items.forEach((item) => item.hide());
  }

  /** Update an item's text and optionally its tooltip. */
  update(id: string, text: string, tooltip?: string | vscode.MarkdownString): void {
    const item = this.items.get(id);
    if (!item) return;
    item.text = text;
    if (tooltip !== undefined) item.tooltip = tooltip;
  }

  /** Show or hide a 'conditional' item. No-op when the group itself is hidden. */
  setVisible(id: string, visible: boolean): void {
    const item = this.items.get(id);
    if (!item) return;
    if (visible && this.isShown) {
      item.show();
    } else {
      item.hide();
    }
  }

  dispose(): void {
    this.items.forEach((item) => item.dispose());
    this.items.clear();
  }
}

export function sortStatusBarItemSpecs(specs: readonly StatusBarItemSpec[]): StatusBarItemSpec[] {
  return [...specs].sort((a, b) => b.priority - a.priority);
}

export function isStatusBarItemSpecVisible(
  spec: StatusBarItemSpec,
  surface: StatusBarActiveSurface,
): boolean {
  if (!spec.activeCustomEditorId) {
    return true;
  }

  return surface.activeCustomEditorId === spec.activeCustomEditorId;
}

export function getActiveCustomEditorId(): string | null {
  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const input = activeTab?.input as { viewType?: unknown } | undefined;
  return typeof input?.viewType === 'string' ? input.viewType : null;
}

export function getStatusBarActiveSurface(): StatusBarActiveSurface {
  return {
    activeCustomEditorId: getActiveCustomEditorId(),
  };
}

/**
 * Projects package-owned status specs into native StatusBar items and updates
 * their visibility imperatively when the active editor/tab changes.
 */
export class StatusBarProjectionManager implements vscode.Disposable {
  private readonly group: StatusBarGroup;
  private readonly specs: readonly StatusBarItemSpec[];
  private readonly resolveActiveSurface: () => StatusBarActiveSurface;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    specs: readonly StatusBarItemSpec[],
    options: StatusBarProjectionManagerOptions = {},
  ) {
    this.specs = sortStatusBarItemSpecs(specs);
    this.resolveActiveSurface = options.resolveActiveSurface ?? getStatusBarActiveSurface;
    this.group = new StatusBarGroup(
      this.specs.map((spec) => ({
        id: spec.id,
        alignment: spec.alignment,
        priority: spec.priority,
        name: spec.name,
        tooltip: spec.tooltip,
        command: spec.command,
        visible: spec.activeCustomEditorId ? 'conditional' : 'always',
      })),
    );

    for (const spec of this.specs) {
      if (spec.text !== undefined) {
        this.group.update(spec.id, spec.text, spec.tooltip);
      }
    }

    this.group.show();

    if (options.autoSubscribe !== false) {
      this.disposables.push(
        vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
        vscode.window.tabGroups.onDidChangeTabs(() => this.refresh()),
        vscode.window.tabGroups.onDidChangeTabGroups(() => this.refresh()),
      );
    }

    this.refresh();
  }

  get(id: string): vscode.StatusBarItem | undefined {
    return this.group.get(id);
  }

  update(id: string, text: string, tooltip?: string | vscode.MarkdownString): void {
    this.group.update(id, text, tooltip);
  }

  refresh(surface: StatusBarActiveSurface = this.resolveActiveSurface()): void {
    for (const spec of this.specs) {
      if (spec.activeCustomEditorId) {
        this.group.setVisible(spec.id, isStatusBarItemSpecVisible(spec, surface));
      }
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.group.dispose();
  }
}
