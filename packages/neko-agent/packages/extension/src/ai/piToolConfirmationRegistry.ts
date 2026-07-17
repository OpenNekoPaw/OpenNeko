const DEFAULT_CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingConfirmation {
  readonly resolve: (approved: boolean) => void;
  readonly cancel: () => void;
}

export class PiToolConfirmationRegistry {
  private readonly pending = new Map<string, PendingConfirmation>();

  constructor(private readonly timeoutMs: number = DEFAULT_CONFIRMATION_TIMEOUT_MS) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Pi tool confirmation timeout must be a positive finite number.');
    }
  }

  async request(
    toolCallId: string,
    publish: () => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const decision = this.wait(toolCallId, signal);
    try {
      await publish();
    } catch (error: unknown) {
      this.cancel(toolCallId);
      await decision;
      throw error;
    }
    return decision;
  }

  private wait(toolCallId: string, signal?: AbortSignal): Promise<boolean> {
    if (this.pending.has(toolCallId)) {
      throw new Error(`Pi tool confirmation ${toolCallId} is already pending.`);
    }
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const settle = (approved: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        this.pending.delete(toolCallId);
        resolve(approved);
      };
      const abort = (): void => settle(false);
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abort);
        this.pending.delete(toolCallId);
        reject(
          new Error(
            `Pi tool confirmation ${toolCallId} timed out after ${this.timeoutMs}ms without a user decision.`,
          ),
        );
      }, this.timeoutMs);
      this.pending.set(toolCallId, {
        resolve: settle,
        cancel: () => settle(false),
      });
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  }

  resolve(toolCallId: string, approved: boolean): void {
    const pending = this.pending.get(toolCallId);
    if (!pending) {
      throw new Error(`Pi tool confirmation ${toolCallId} is not pending.`);
    }
    pending.resolve(approved);
  }

  private cancel(toolCallId: string): boolean {
    const pending = this.pending.get(toolCallId);
    if (!pending) return false;
    pending.cancel();
    return true;
  }

  cancelAll(): void {
    for (const pending of this.pending.values()) pending.cancel();
    this.pending.clear();
  }
}
