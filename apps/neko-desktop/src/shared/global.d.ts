import type { OpenNekoDesktopBridge } from './bridge-contract';
import type { OpenNekoDesktopShellBridge } from './shell-contract';

declare global {
  interface Window {
    readonly openNekoDesktop: OpenNekoDesktopBridge & OpenNekoDesktopShellBridge;
  }
}

export {};
