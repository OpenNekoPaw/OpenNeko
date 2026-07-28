export class PreviewOperationQueue<TOwner extends object> {
  private readonly operations = new Map<TOwner, Promise<void>>();

  run(owner: TOwner, operation: () => Promise<void>): Promise<void> {
    const previous = this.operations.get(owner) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.operations.set(owner, current);
    return current.then(
      () => this.release(owner, current),
      (error: unknown) => {
        this.release(owner, current);
        throw error;
      },
    );
  }

  private release(owner: TOwner, operation: Promise<void>): void {
    if (this.operations.get(owner) === operation) {
      this.operations.delete(owner);
    }
  }
}
