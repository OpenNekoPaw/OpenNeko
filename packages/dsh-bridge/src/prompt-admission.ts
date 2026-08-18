const MAX_ACTIVE_PROMPTS = 2;
const MAX_QUEUED_PROMPTS = 32;

interface PromptEntry<T> {
  readonly sessionId: string;
  readonly operation: () => Promise<T>;
  readonly completion: PromptCompletion<T>;
}

interface PromptCompletion<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

export class PromptAdmission<T> {
  private readonly active = new Map<string, PromptEntry<T>>();
  private readonly queued = new Map<string, PromptEntry<T>>();
  private readonly queue: PromptEntry<T>[] = [];
  private closed = false;

  run(sessionId: string, operation: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error('DSH ACP Prompt admission is closed.');
    if (this.active.has(sessionId) || this.queued.has(sessionId)) {
      throw new Error(`A prompt is already active or queued for Session ${sessionId}.`);
    }
    const entry: PromptEntry<T> = {
      sessionId,
      operation,
      completion: createPromptCompletion<T>(),
    };
    if (this.active.size < MAX_ACTIVE_PROMPTS) {
      this.start(entry);
    } else {
      if (this.queue.length >= MAX_QUEUED_PROMPTS) {
        throw new Error('DSH ACP Prompt queue limit exceeded.');
      }
      this.queue.push(entry);
      this.queued.set(sessionId, entry);
    }
    return entry.completion.promise;
  }

  cancel(sessionId: string): 'active' | 'queued' | 'missing' {
    if (this.active.has(sessionId)) return 'active';
    const entry = this.queued.get(sessionId);
    if (entry === undefined) return 'missing';
    const index = this.queue.indexOf(entry);
    if (index < 0) throw new Error('Queued DSH ACP Prompt lost its exact FIFO identity.');
    this.queue.splice(index, 1);
    this.queued.delete(sessionId);
    entry.completion.reject(
      new Error(`DSH ACP Prompt for Session ${sessionId} was cancelled before execution.`),
    );
    return 'queued';
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.queue) {
      entry.completion.reject(
        new Error(`DSH ACP Prompt for Session ${entry.sessionId} was cancelled before execution.`),
      );
    }
    this.queue.length = 0;
    this.queued.clear();
  }

  private start(entry: PromptEntry<T>): void {
    this.active.set(entry.sessionId, entry);
    void this.execute(entry);
  }

  private async execute(entry: PromptEntry<T>): Promise<void> {
    try {
      entry.completion.resolve(await entry.operation());
    } catch (error) {
      entry.completion.reject(error);
    } finally {
      this.active.delete(entry.sessionId);
      this.schedule();
    }
  }

  private schedule(): void {
    if (this.closed) return;
    while (this.active.size < MAX_ACTIVE_PROMPTS) {
      const entry = this.queue.shift();
      if (entry === undefined) return;
      this.queued.delete(entry.sessionId);
      this.start(entry);
    }
  }
}

function createPromptCompletion<T>(): PromptCompletion<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
