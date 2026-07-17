import type { PreviewPlaybackRecord, PreviewRuntimeRecord, RuntimePreviewVariant } from './types';

export class PreviewRuntime {
  private readonly records = new Map<string, PreviewRuntimeRecord>();
  private activePlayback: PreviewPlaybackRecord | null = null;

  setVariant(id: string, variant: RuntimePreviewVariant, cleanup?: () => void): void {
    this.release(id);
    this.records.set(id, { id, variant, cleanup });
  }

  getVariant(id: string): RuntimePreviewVariant | undefined {
    return this.records.get(id)?.variant;
  }

  startPlayback(record: PreviewPlaybackRecord): void {
    if (this.activePlayback?.id !== record.id) {
      this.activePlayback?.stop();
    }
    this.activePlayback = record;
  }

  stopPlayback(id?: string): void {
    if (!this.activePlayback || (id && this.activePlayback.id !== id)) {
      return;
    }

    this.activePlayback.stop();
    this.activePlayback = null;
  }

  release(id: string): void {
    const record = this.records.get(id);
    record?.cleanup?.();
    this.records.delete(id);
    this.stopPlayback(id);
  }

  dispose(): void {
    for (const id of Array.from(this.records.keys())) {
      this.release(id);
    }
    this.stopPlayback();
  }
}
