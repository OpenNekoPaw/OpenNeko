const POLL_INTERVAL_MS = 100;

export async function connectDesktopCdp(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const WebSocketImpl = options.WebSocketImpl ?? WebSocket;
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${options.port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find(
          (candidate) =>
            candidate.type === 'page' &&
            typeof candidate.webSocketDebuggerUrl === 'string' &&
            isDesktopRendererUrl(candidate.url),
        );
        if (target) {
          return CdpClient.connect(target.webSocketDebuggerUrl, WebSocketImpl);
        }
      }
    } catch (error) {
      lastError = error;
    }
    await delay(POLL_INTERVAL_MS);
  }
  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Desktop CDP target was not ready before timeout.${detail}`);
}

class CdpClient {
  static async connect(url, WebSocketImpl = WebSocket) {
    const socket = new WebSocketImpl(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener(
        'error',
        () => reject(new Error('Desktop CDP WebSocket failed before opening.')),
        { once: true },
      );
    });
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener('message', (event) => this.handleMessage(event.data));
    socket.addEventListener('close', () => this.rejectPending('Desktop CDP connection closed.'));
    socket.addEventListener('error', () => this.rejectPending('Desktop CDP connection failed.'));
  }

  async send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  close() {
    this.socket.close();
  }

  handleMessage(input) {
    const message = JSON.parse(String(input));
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            `Desktop CDP ${pending.method} failed: ${String(message.error.message ?? 'unknown error')}`,
          ),
        );
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }
    if (typeof message.method !== 'string') return;
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  rejectPending(message) {
    for (const pending of this.pending.values()) pending.reject(new Error(message));
    this.pending.clear();
  }
}

function isDesktopRendererUrl(value) {
  if (typeof value !== 'string') return false;
  return (
    value.startsWith('openneko://desktop/') ||
    value.startsWith('http://localhost:') ||
    value.startsWith('http://127.0.0.1:')
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
