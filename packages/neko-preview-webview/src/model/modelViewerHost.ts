export interface ModelViewerHostPort {
  postMessage(message: unknown): void;
  getState(): Record<string, unknown> | null;
  setState(state: unknown): void;
  subscribe(listener: (message: unknown) => void): () => void;
}
