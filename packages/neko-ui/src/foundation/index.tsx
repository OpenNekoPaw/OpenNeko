import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

export type WebviewFoundationHostKind = 'vscode' | 'electron' | 'browser' | 'test';
export type WebviewFoundationThemeKind = 'light' | 'dark' | 'high-contrast';
export type WebviewFoundationDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface WebviewFoundationLogger {
  debug(message: string, metadata?: Readonly<Record<string, unknown>>): void;
  info(message: string, metadata?: Readonly<Record<string, unknown>>): void;
  warn(message: string, metadata?: Readonly<Record<string, unknown>>): void;
  error(message: string, metadata?: Readonly<Record<string, unknown>>): void;
}

export interface WebviewFoundationDiagnostic {
  readonly code: string;
  readonly severity: WebviewFoundationDiagnosticSeverity;
  readonly message: string;
  readonly source?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WebviewFoundationTheme {
  readonly kind: WebviewFoundationThemeKind;
  readonly tokens?: Readonly<Record<string, string>>;
}

export interface WebviewFoundationKeyboardFocus {
  reportFocus?(focused: boolean): void;
  reportEditable?(editable: boolean): void;
}

export interface WebviewFoundationResourceProjectionInput {
  readonly stableRef: {
    readonly kind: string;
    readonly id: string;
    readonly source: string;
  };
  readonly purpose: 'thumbnail' | 'preview' | 'open' | 'agent-context';
}

export interface WebviewFoundationResourceProjectionResult {
  readonly uri: string;
  readonly currentSessionOnly: true;
}

export interface WebviewFoundationResources {
  projectResource?(
    input: WebviewFoundationResourceProjectionInput,
  ): WebviewFoundationResourceProjectionResult | undefined;
}

export interface WebviewFoundationContextValue {
  readonly hostKind: WebviewFoundationHostKind;
  readonly runtimeId: string;
  readonly locale: string;
  readonly theme: WebviewFoundationTheme;
  readonly logger?: WebviewFoundationLogger;
  readonly diagnostics?: {
    report(diagnostic: WebviewFoundationDiagnostic): void;
  };
  readonly keyboard?: WebviewFoundationKeyboardFocus;
  readonly resources?: WebviewFoundationResources;
}

export interface WebviewFoundationProviderProps {
  readonly value: WebviewFoundationContextValue;
  readonly children: ReactNode;
}

export class MissingWebviewFoundationError extends Error {
  readonly diagnostic: WebviewFoundationDiagnostic;

  constructor(message = 'Webview foundation context is required.') {
    super(message);
    this.name = 'MissingWebviewFoundationError';
    this.diagnostic = {
      code: 'missing-webview-foundation',
      severity: 'error',
      message,
      source: '@neko/ui/foundation',
    };
  }
}

const WebviewFoundationContext = createContext<WebviewFoundationContextValue | undefined>(
  undefined,
);

export function WebviewFoundationProvider({
  value,
  children,
}: WebviewFoundationProviderProps): ReactElement {
  return (
    <WebviewFoundationContext.Provider value={value}>{children}</WebviewFoundationContext.Provider>
  );
}

export function useOptionalWebviewFoundation(): WebviewFoundationContextValue | undefined {
  return useContext(WebviewFoundationContext);
}

export function useWebviewFoundation(): WebviewFoundationContextValue {
  const value = useOptionalWebviewFoundation();
  if (!value) {
    throw new MissingWebviewFoundationError();
  }
  return value;
}

export function createWebviewFoundation(
  input: WebviewFoundationContextValue,
): WebviewFoundationContextValue {
  if (input.runtimeId.trim().length === 0) {
    throw new Error('Webview foundation runtimeId is required.');
  }
  if (input.locale.trim().length === 0) {
    throw new Error('Webview foundation locale is required.');
  }
  return input;
}
