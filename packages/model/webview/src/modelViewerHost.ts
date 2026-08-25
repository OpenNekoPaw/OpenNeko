export interface ModelViewerHostPort {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
  subscribe(listener: (message: unknown) => void): () => void;
}
