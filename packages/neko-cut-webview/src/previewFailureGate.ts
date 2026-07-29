import type { CutUserDiagnostic } from '@neko-cut/domain';

export type PreviewFailureStage = 'video' | 'audio' | 'synchronization' | 'startup';

export class PreviewFailureGate {
  private currentAttempt = 0;
  private failedAttempt: number | undefined;

  begin(): number {
    this.currentAttempt += 1;
    this.failedAttempt = undefined;
    return this.currentAttempt;
  }

  invalidate(): void {
    this.currentAttempt += 1;
    this.failedAttempt = undefined;
  }

  accept(attempt: number): boolean {
    if (attempt !== this.currentAttempt || this.failedAttempt === attempt) return false;
    this.failedAttempt = attempt;
    return true;
  }
}

export function previewFailureDiagnostic(stage: PreviewFailureStage): CutUserDiagnostic {
  switch (stage) {
    case 'video':
      return { code: 'preview-video-failed' };
    case 'audio':
      return { code: 'preview-audio-failed' };
    case 'synchronization':
      return { code: 'preview-sync-failed' };
    case 'startup':
      return { code: 'preview-start-failed' };
  }
}
