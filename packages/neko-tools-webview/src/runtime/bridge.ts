export interface IWebviewBridge {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
  subscribe(listener: (message: unknown) => void): () => void;
}

class WindowWebviewBridge implements IWebviewBridge {
  private state: unknown;

  postMessage(message: unknown): void {
    window.parent.postMessage(message, '*');
  }

  getState<T>(): T | undefined {
    return this.state as T | undefined;
  }

  setState<T>(state: T): void {
    this.state = state;
  }

  subscribe(listener: (message: unknown) => void): () => void {
    const handler = (event: MessageEvent<unknown>) => {
      listener(event.data);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }
}

const bridge = new WindowWebviewBridge();

export function getWebviewBridge(): IWebviewBridge {
  return bridge;
}
