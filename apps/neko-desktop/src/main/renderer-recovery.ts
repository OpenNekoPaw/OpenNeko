export interface DesktopRendererReloadTarget {
  isDestroyed(): boolean;
  reload(): void;
}

export class DesktopRendererRecovery {
  private attempted = false;

  recover(target: DesktopRendererReloadTarget): boolean {
    if (this.attempted || target.isDestroyed()) return false;
    this.attempted = true;
    target.reload();
    return true;
  }
}
