import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

export async function listCdpTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json`);
  if (!response.ok) {
    throw new Error(`CDP target request failed with HTTP ${response.status}`);
  }
  const targets = await response.json();
  if (!Array.isArray(targets)) {
    throw new Error('CDP target response must be an array');
  }
  return targets.map(projectTarget);
}

export async function waitForCdpTarget(port, matcher, timeoutMs) {
  const startedAt = Date.now();
  let lastTargets = [];
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      lastTargets = await listCdpTargets(port);
      const target = selectCdpTarget(lastTargets, matcher);
      if (target) {
        return target;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(
    `Timed out waiting for CDP target ${JSON.stringify(matcher)}. Last error: ${lastError?.message ?? 'none'}. Targets: ${JSON.stringify(lastTargets)}`,
  );
}

export function selectCdpTarget(targets, matcher) {
  return targets.find(
    (candidate) =>
      matchesTarget(candidate, matcher) &&
      !matcher.excludeTargetIds?.includes(candidate.id),
  );
}

export class CdpSession {
  #nextId = 1;
  #pending = new Map();
  #executionContexts = new Map();
  #socket;

  constructor(target, options = {}) {
    if (!target.webSocketDebuggerUrl) {
      throw new Error(`CDP target ${target.id} has no WebSocket debugger URL`);
    }
    this.target = target;
    this.options = options;
    this.events = [];
    this.#socket = new WebSocket(target.webSocketDebuggerUrl);
  }

  async connect(timeoutMs = 10000) {
    await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP WebSocket connection timed out')), timeoutMs);
      this.#socket.once('open', () => {
        clearTimeout(timeout);
        resolvePromise();
      });
      this.#socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    this.#socket.on('message', (data) => this.#handleMessage(data));
    this.#socket.on('close', () => {
      for (const { reject, timeout } of this.#pending.values()) {
        clearTimeout(timeout);
        reject(new Error('CDP WebSocket closed before command completed'));
      }
      this.#pending.clear();
    });
    await Promise.all([
      this.send('Runtime.enable'),
      this.send('DOM.enable'),
      this.send('Log.enable'),
      this.send('Network.enable'),
      this.send('Page.enable').catch(() => undefined),
    ]);
    if (this.options.documentFrame === 'deepest-child') {
      this.documentFrameId = await this.#waitForContentFrame(timeoutMs);
      await this.#waitForDocumentExecutionContext(timeoutMs);
    }
  }

  send(method, params = {}, timeoutMs = 10000) {
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolvePromise, reject) => {
      if (this.#socket.readyState !== WebSocket.OPEN) {
        reject(new Error(`CDP ${method} cannot run because the WebSocket is not open.`));
        return;
      }
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      this.#pending.set(id, { resolve: resolvePromise, reject, method, timeout });
      try {
        this.#socket.send(JSON.stringify({ id, method, params }), (error) => {
          if (error) {
            const pending = this.#pending.get(id);
            if (pending) clearTimeout(pending.timeout);
            this.#pending.delete(id);
            reject(error);
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
      ...(this.documentContextId ? { contextId: this.documentContextId } : {}),
    });
    if (response.exceptionDetails) {
      throw new Error(formatExceptionDetails(response.exceptionDetails));
    }
    return response.result?.value;
  }

  async captureDomSnapshot() {
    const html = await this.evaluate('document.documentElement?.outerHTML ?? ""');
    if (typeof html !== 'string') {
      throw new Error('CDP DOM snapshot did not return HTML');
    }
    return html;
  }

  async captureScreenshot() {
    const response = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    if (typeof response.data !== 'string' || response.data.length === 0) {
      throw new Error('CDP screenshot did not return image data');
    }
    return Buffer.from(response.data, 'base64');
  }

  async dispatchKey(key) {
    for (const command of createKeyDispatchSequence(key)) {
      await this.send(command.method, command.params);
    }
  }

  async hasDocumentFocus() {
    return this.evaluate('document.hasFocus()');
  }

  async dispatchClick(x, y) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
  }

  async dispatchDrag(origin, destination) {
    const sequence = createMouseDragSequence(origin, destination);
    for (const [index, params] of sequence.entries()) {
      await this.send('Input.dispatchMouseEvent', params);
      if (index === 0) await delay(50);
      else if (params.type === 'mouseMoved') await delay(16);
    }
  }

  async focusFrame(frameId) {
    const owner = await this.send('DOM.getFrameOwner', { frameId });
    if (typeof owner.backendNodeId !== 'number') {
      throw new Error(`CDP frame ${frameId} has no focusable owner node.`);
    }
    await this.send('DOM.focus', { backendNodeId: owner.backendNodeId });
  }

  close() {
    this.#socket.close();
  }

  #handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString('utf8'));
    } catch (error) {
      this.events.push({
        source: 'webview-exception',
        level: 'error',
        message: `Invalid CDP message: ${error.message}`,
      });
      return;
    }
    if (typeof message.id === 'number') {
      const pending = this.#pending.get(message.id);
      if (!pending) {
        return;
      }
      this.#pending.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.error) {
        pending.reject(new Error(`${pending.method} failed: ${message.error.message}`));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }
    if (message.method === 'Runtime.executionContextCreated') {
      const context = message.params?.context;
      if (typeof context?.id === 'number') {
        this.#executionContexts.set(context.id, context);
      }
      return;
    }
    if (message.method === 'Runtime.executionContextDestroyed') {
      this.#executionContexts.delete(message.params?.executionContextId);
      return;
    }
    if (message.method === 'Runtime.executionContextsCleared') {
      this.#executionContexts.clear();
      return;
    }
    const projected = projectCdpEvent(message);
    if (projected) {
      this.events.push(projected);
    }
  }

  async #waitForDocumentExecutionContext(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const context = [...this.#executionContexts.values()].find(
        (candidate) =>
          candidate.auxData?.frameId === this.documentFrameId &&
          candidate.auxData?.isDefault === true,
      );
      if (context) {
        this.documentContextId = context.id;
        return;
      }
      await delay(50);
    }
    throw new Error(`Timed out waiting for Webview document frame ${this.documentFrameId}.`);
  }

  async #waitForContentFrame(timeoutMs) {
    const startedAt = Date.now();
    let lastError;
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const frameTree = await this.send('Page.getFrameTree');
        return selectWebviewContentFrameId(frameTree.frameTree);
      } catch (error) {
        lastError = error;
      }
      await delay(50);
    }
    throw new Error(
      `Timed out waiting for VS Code Webview content frame: ${lastError?.message ?? 'not available'}`,
    );
  }
}

export function resolveKeyIdentity(key) {
  const controlKeys = {
    Enter: { code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
    Escape: { code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
    Delete: { code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 },
    Backspace: { code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 },
    Tab: { code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
  };
  return { key, ...(controlKeys[key] ?? { code: key }) };
}

export function createKeyDispatchSequence(key) {
  const keyIdentity = resolveKeyIdentity(key);
  return [
    { method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', ...keyIdentity } },
    { method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', ...keyIdentity } },
  ];
}

export function createMouseDragSequence(origin, destination, steps = 8) {
  const sequence = [
    {
      type: 'mousePressed',
      x: origin.x,
      y: origin.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    },
  ];
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    sequence.push({
      type: 'mouseMoved',
      x: origin.x + (destination.x - origin.x) * progress,
      y: origin.y + (destination.y - origin.y) * progress,
      button: 'left',
      buttons: 1,
    });
  }
  sequence.push({
    type: 'mouseReleased',
    x: destination.x,
    y: destination.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  return sequence;
}

export function selectWebviewContentFrameId(frameTree) {
  if (!frameTree?.frame?.id) {
    throw new Error('CDP frame tree has no root frame identity.');
  }
  const contentFrame = frameTree.childFrames?.[0];
  if (!contentFrame?.frame?.id) {
    throw new Error('VS Code Webview bootstrap has no active content frame.');
  }
  return contentFrame.frame.id;
}

function matchesTarget(target, matcher) {
  if (target.type !== matcher.type) {
    return false;
  }
  if (matcher.extensionId && !contains(target, matcher.extensionId)) {
    return false;
  }
  if (matcher.viewType && !contains(target, matcher.viewType)) {
    return false;
  }
  if (matcher.titleIncludes && !target.title.toLowerCase().includes(matcher.titleIncludes.toLowerCase())) {
    return false;
  }
  return !matcher.urlIncludes || target.url.toLowerCase().includes(matcher.urlIncludes.toLowerCase());
}

function contains(target, expected) {
  const normalized = expected.toLowerCase();
  return target.title.toLowerCase().includes(normalized) || target.url.toLowerCase().includes(normalized);
}

function projectTarget(target) {
  return {
    id: String(target.id ?? ''),
    type: String(target.type ?? ''),
    title: String(target.title ?? ''),
    url: String(target.url ?? ''),
    webSocketDebuggerUrl:
      typeof target.webSocketDebuggerUrl === 'string' ? target.webSocketDebuggerUrl : undefined,
  };
}

function projectCdpEvent(message) {
  if (message.method === 'Runtime.exceptionThrown') {
    return {
      source: 'webview-exception',
      level: 'error',
      message: formatExceptionDetails(message.params?.exceptionDetails),
      timestamp: message.params?.timestamp,
    };
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const type = message.params?.type ?? 'log';
    return {
      source: 'console',
      level: type === 'warning' ? 'warning' : type,
      message: (message.params?.args ?? []).map(formatRemoteObject).join(' '),
      timestamp: message.params?.timestamp,
    };
  }
  if (message.method === 'Log.entryAdded') {
    const entry = message.params?.entry ?? {};
    return {
      source: entry.source === 'violation' ? 'csp' : 'log',
      level: entry.level ?? 'error',
      message: entry.text ?? '',
      url: entry.url,
      timestamp: entry.timestamp,
    };
  }
  if (message.method === 'Network.loadingFailed' && !message.params?.canceled) {
    return {
      source: 'resource',
      level: 'error',
      message: message.params?.errorText ?? 'Resource loading failed',
      requestId: message.params?.requestId,
      timestamp: message.params?.timestamp,
    };
  }
  return undefined;
}

function formatRemoteObject(remoteObject) {
  if (typeof remoteObject?.value === 'string') {
    return remoteObject.value;
  }
  if (remoteObject?.value !== undefined) {
    return JSON.stringify(remoteObject.value);
  }
  return remoteObject?.description ?? remoteObject?.type ?? '';
}

function formatExceptionDetails(details) {
  return (
    details?.exception?.description ??
    details?.exception?.value ??
    details?.text ??
    'Unknown Webview exception'
  );
}
