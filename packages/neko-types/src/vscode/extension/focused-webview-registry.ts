export interface FocusedWebviewPostTarget {
  readonly postMessage: (message: Record<string, unknown>) => PromiseLike<boolean> | boolean;
}

export interface FocusedWebviewPanelLike {
  readonly webview: FocusedWebviewPostTarget;
  readonly active?: boolean;
  readonly visible?: boolean;
}

export interface FocusedWebviewRegistration {
  readonly id?: string;
  readonly viewType: string;
  readonly documentUri?: string;
  readonly panel: FocusedWebviewPanelLike;
  readonly visible?: boolean;
  readonly active?: boolean;
}

export interface FocusedWebviewResolveRequest {
  readonly viewType: string;
  readonly id?: string;
  readonly documentUri?: string;
  readonly allowRecentVisibleFallback?: boolean;
  readonly allowSingleVisibleFallback?: boolean;
}

export interface FocusedWebviewResolution {
  readonly id: string;
  readonly viewType: string;
  readonly documentUri?: string;
  readonly panel: FocusedWebviewPanelLike;
}

export interface FocusedWebviewDisposable {
  dispose(): void;
}

export interface IFocusedWebviewRegistry {
  register(entry: FocusedWebviewRegistration): FocusedWebviewDisposable;
  unregister(id: string): void;
  markActive(id: string): void;
  markInactive(id: string): void;
  markVisible(id: string, visible: boolean): void;
  markKeyboardFocused(id: string, focused: boolean): void;
  markKeyboardEditable(id: string, editable: boolean): void;
  hasKeyboardEditable(request: FocusedWebviewResolveRequest): boolean;
  syncFocus(id: string): void;
  resolve(request: FocusedWebviewResolveRequest): FocusedWebviewResolution | undefined;
  postKeyboardAction(action: string, request: FocusedWebviewResolveRequest): Promise<boolean>;
}

interface RegisteredFocusedWebview {
  readonly id: string;
  readonly viewType: string;
  readonly documentUri?: string;
  readonly panel: FocusedWebviewPanelLike;
  readonly registeredAt: number;
  active: boolean;
  visible: boolean;
  lastFocusedAt: number;
  keyboardFocused: boolean;
  keyboardEditable: boolean;
}

export class FocusedWebviewRegistry implements IFocusedWebviewRegistry {
  private readonly entries = new Map<string, RegisteredFocusedWebview>();
  private clock = 0;

  register(entry: FocusedWebviewRegistration): FocusedWebviewDisposable {
    const id = entry.id ?? this.createId(entry.viewType);
    const visible = entry.visible ?? entry.panel.visible ?? false;
    const active = entry.active ?? entry.panel.active ?? false;
    const registered: RegisteredFocusedWebview = {
      id,
      viewType: entry.viewType,
      documentUri: entry.documentUri,
      panel: entry.panel,
      registeredAt: this.tick(),
      active,
      visible,
      lastFocusedAt: active ? this.tick() : 0,
      keyboardFocused: false,
      keyboardEditable: false,
    };

    this.entries.set(id, registered);
    if (active && visible) {
      this.setKeyboardFocusedEntry(registered);
    }

    return {
      dispose: () => this.unregister(id),
    };
  }

  unregister(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    this.entries.delete(id);
    if (entry.keyboardFocused) {
      void postKeyboardFocus(entry, false);
    }
  }

  markActive(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    this.setActiveEntry(entry);
    this.setKeyboardFocusedEntry(entry);
  }

  markKeyboardFocused(id: string, focused: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    if (focused) {
      this.setActiveEntry(entry);
      this.setKeyboardFocusedEntry(entry);
      return;
    }

    this.markKeyboardBlurred(entry);
  }

  markKeyboardEditable(id: string, editable: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    entry.keyboardEditable = editable;
  }

  hasKeyboardEditable(request: FocusedWebviewResolveRequest): boolean {
    const resolution = this.resolve(request);
    return resolution ? this.entries.get(resolution.id)?.keyboardEditable === true : false;
  }

  markInactive(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    entry.active = false;
    entry.keyboardEditable = false;
    if (entry.keyboardFocused) {
      entry.keyboardFocused = false;
      void postKeyboardFocus(entry, false);
    }
  }

  markVisible(id: string, visible: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    entry.visible = visible;
    if (!visible) {
      entry.active = false;
      entry.keyboardEditable = false;
      if (entry.keyboardFocused) {
        entry.keyboardFocused = false;
        void postKeyboardFocus(entry, false);
      }
    }
  }

  syncFocus(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) {
      return;
    }

    void postKeyboardFocus(entry, entry.keyboardFocused);
  }

  resolve(request: FocusedWebviewResolveRequest): FocusedWebviewResolution | undefined {
    const entries = this.getEntriesForViewType(request.viewType);
    if (entries.length === 0) {
      return undefined;
    }

    if (request.id) {
      return toResolution(entries.find((entry) => entry.id === request.id));
    }

    if (request.documentUri) {
      const matches = entries.filter((entry) => entry.documentUri === request.documentUri);
      const documentMatch =
        findActiveVisible(matches) ?? findMostRecentVisible(matches) ?? findMostRecent(matches);
      if (documentMatch) {
        return toResolution(documentMatch);
      }
    }

    const activeVisible = findActiveVisible(entries);
    if (activeVisible) {
      return toResolution(activeVisible);
    }

    if (request.allowRecentVisibleFallback !== false) {
      const recentVisible = findMostRecentVisible(entries);
      if (recentVisible) {
        return toResolution(recentVisible);
      }
    }

    if (request.allowSingleVisibleFallback) {
      const visibleEntries = entries.filter((entry) => entry.visible);
      if (visibleEntries.length === 1) {
        return toResolution(visibleEntries[0]);
      }
    }

    return undefined;
  }

  async postKeyboardAction(
    action: string,
    request: FocusedWebviewResolveRequest,
  ): Promise<boolean> {
    const resolution = this.resolve(request);
    if (!resolution) {
      return false;
    }

    return Boolean(
      await resolution.panel.webview.postMessage({
        type: 'keyboardAction',
        action,
        viewType: resolution.viewType,
        documentUri: resolution.documentUri,
      }),
    );
  }

  private setActiveEntry(entry: RegisteredFocusedWebview): void {
    for (const candidate of this.entries.values()) {
      if (candidate.viewType === entry.viewType) {
        candidate.active = candidate.id === entry.id;
      }
    }

    entry.visible = entry.panel.visible ?? true;
    entry.lastFocusedAt = this.tick();
  }

  private markKeyboardBlurred(entry: RegisteredFocusedWebview): void {
    entry.keyboardEditable = false;
    if (entry.keyboardFocused) {
      entry.keyboardFocused = false;
      void postKeyboardFocus(entry, false);
    }
  }

  private getEntriesForViewType(viewType: string): RegisteredFocusedWebview[] {
    return Array.from(this.entries.values()).filter((entry) => entry.viewType === viewType);
  }

  private setKeyboardFocusedEntry(entry: RegisteredFocusedWebview): void {
    for (const candidate of this.entries.values()) {
      if (candidate.viewType !== entry.viewType) {
        continue;
      }

      const focused = candidate.id === entry.id && candidate.visible;
      if (candidate.keyboardFocused === focused) {
        continue;
      }

      candidate.keyboardFocused = focused;
      void postKeyboardFocus(candidate, focused);
    }
  }

  private createId(viewType: string): string {
    return `${viewType}:${this.tick()}`;
  }

  private tick(): number {
    this.clock += 1;
    return this.clock;
  }
}

export function createFocusedWebviewRegistry(): IFocusedWebviewRegistry {
  return new FocusedWebviewRegistry();
}

function toResolution(
  entry: RegisteredFocusedWebview | undefined,
): FocusedWebviewResolution | undefined {
  if (!entry) {
    return undefined;
  }

  return {
    id: entry.id,
    viewType: entry.viewType,
    documentUri: entry.documentUri,
    panel: entry.panel,
  };
}

function findActiveVisible(
  entries: readonly RegisteredFocusedWebview[],
): RegisteredFocusedWebview | undefined {
  return findMostRecent(entries.filter((entry) => entry.active && entry.visible));
}

function findMostRecentVisible(
  entries: readonly RegisteredFocusedWebview[],
): RegisteredFocusedWebview | undefined {
  return findMostRecent(entries.filter((entry) => entry.visible));
}

function findMostRecent(
  entries: readonly RegisteredFocusedWebview[],
): RegisteredFocusedWebview | undefined {
  return [...entries].sort((left, right) => {
    if (left.lastFocusedAt !== right.lastFocusedAt) {
      return right.lastFocusedAt - left.lastFocusedAt;
    }
    return right.registeredAt - left.registeredAt;
  })[0];
}

async function postKeyboardFocus(entry: RegisteredFocusedWebview, focused: boolean): Promise<void> {
  try {
    await entry.panel.webview.postMessage({
      type: 'keyboardFocus',
      focused,
      viewType: entry.viewType,
      documentUri: entry.documentUri,
    });
  } catch {
    // Focus feedback is best-effort because panels can be disposed while VSCode
    // view state events are still draining.
  }
}
