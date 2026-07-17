import type { VSCodeAPI } from './types';
import { resetVSCodeApi } from './api';

export interface MockVSCodeApi extends VSCodeAPI {
  readonly postedMessages: unknown[];
  readonly postMessageCalls: unknown[][];
  readonly stateWrites: unknown[];
}

export interface MockWebviewWindow {
  readonly acquireCalls: number;
  readonly listeners: readonly WebviewMessageListener[];
  readonly api: MockVSCodeApi;
  dispatchMessage(data: unknown): void;
  dispose(): void;
}

type WebviewMessageListener = (event: MessageEvent) => void;

export function createMockVSCodeApi(initialState?: unknown): MockVSCodeApi {
  let state = initialState;
  const postedMessages: unknown[] = [];
  const postMessageCalls: unknown[][] = [];
  const stateWrites: unknown[] = [];

  return {
    postedMessages,
    postMessageCalls,
    stateWrites,
    postMessage(message: unknown): void {
      postedMessages.push(message);
      postMessageCalls.push([message]);
    },
    getState<T = unknown>(): T | undefined {
      return state as T | undefined;
    },
    setState<T = unknown>(nextState: T): void {
      state = nextState;
      stateWrites.push(nextState);
    },
  };
}

export function installMockWebviewWindow(api = createMockVSCodeApi()): MockWebviewWindow {
  resetVSCodeApi();

  const previousWindow = globalThis.window;
  let acquireCalls = 0;
  const listeners: WebviewMessageListener[] = [];
  const acquireVsCodeApi = () => {
    acquireCalls += 1;
    return api;
  };

  let disposeWindowPatch: () => void;

  if (previousWindow && typeof previousWindow === 'object') {
    disposeWindowPatch = patchExistingWindow(previousWindow, acquireVsCodeApi, listeners);
  } else {
    const mockWindow = {
      acquireVsCodeApi,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'message' && typeof listener === 'function') {
          listeners.push(listener as WebviewMessageListener);
        }
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type !== 'message' || typeof listener !== 'function') return;
        removeListener(listeners, listener as WebviewMessageListener);
      },
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: mockWindow,
      writable: true,
    });

    disposeWindowPatch = () => {
      Reflect.deleteProperty(globalThis, 'window');
    };
  }

  return {
    get acquireCalls() {
      return acquireCalls;
    },
    get listeners() {
      return listeners;
    },
    api,
    dispatchMessage(data: unknown): void {
      const event = { data } as MessageEvent;
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
    dispose(): void {
      resetVSCodeApi();
      disposeWindowPatch();
    },
  };
}

function patchExistingWindow(
  targetWindow: Window & typeof globalThis,
  acquireVsCodeApi: () => VSCodeAPI,
  listeners: WebviewMessageListener[],
): () => void {
  type WindowWithAcquire = Window & typeof globalThis & { acquireVsCodeApi?: () => VSCodeAPI };

  const windowWithAcquire = targetWindow as WindowWithAcquire;
  const acquireDescriptor = Object.getOwnPropertyDescriptor(windowWithAcquire, 'acquireVsCodeApi');
  const addDescriptor = Object.getOwnPropertyDescriptor(windowWithAcquire, 'addEventListener');
  const removeDescriptor = Object.getOwnPropertyDescriptor(
    windowWithAcquire,
    'removeEventListener',
  );

  const addEventListener = windowWithAcquire.addEventListener.bind(windowWithAcquire);
  const removeEventListener = windowWithAcquire.removeEventListener.bind(windowWithAcquire);

  Object.defineProperty(windowWithAcquire, 'acquireVsCodeApi', {
    configurable: true,
    value: acquireVsCodeApi,
    writable: true,
  });

  Object.defineProperty(windowWithAcquire, 'addEventListener', {
    configurable: true,
    value: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'message' && typeof listener === 'function') {
        listeners.push(listener as WebviewMessageListener);
      }
      addEventListener(type, listener, options);
    },
    writable: true,
  });

  Object.defineProperty(windowWithAcquire, 'removeEventListener', {
    configurable: true,
    value: (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === 'message' && typeof listener === 'function') {
        removeListener(listeners, listener as WebviewMessageListener);
      }
      removeEventListener(type, listener, options);
    },
    writable: true,
  });

  return () => {
    restoreProperty(windowWithAcquire, 'acquireVsCodeApi', acquireDescriptor);
    restoreProperty(windowWithAcquire, 'addEventListener', addDescriptor);
    restoreProperty(windowWithAcquire, 'removeEventListener', removeDescriptor);
  };
}

function removeListener(
  listeners: WebviewMessageListener[],
  listener: WebviewMessageListener,
): void {
  const index = listeners.indexOf(listener);
  if (index >= 0) {
    listeners.splice(index, 1);
  }
}

function restoreProperty<T extends object, K extends keyof T>(
  target: T,
  property: K,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }
  Reflect.deleteProperty(target, property);
}
