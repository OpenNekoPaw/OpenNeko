import type { ReactNode } from 'react';
import type { SupportedLocale } from '@neko/shared';
import type { CreativeWorkbenchMainKind } from './creative-workbench';

export type CreativeHostIntentAction = 'activate' | 'focus' | 'play' | 'pause' | 'seek' | 'inspect';

export interface CreativeHostDocumentProjection {
  readonly id: string;
  readonly name: string;
  readonly relativePath: string;
  readonly kind: string;
  readonly resourceUrl?: string;
}

export interface CreativeHostRuntimeProjection {
  readonly label: string;
  readonly packageName: string;
  readonly panelKind: string;
  readonly runtime: 'full-webview-runtime' | 'host-adapter-projection' | 'desktop-native';
  readonly hostAdapterInspector?: 'dock' | 'hidden';
}

export interface CreativeHostIntentHandler {
  (action: CreativeHostIntentAction, payload?: Readonly<Record<string, unknown>>): void;
}

export interface CreativeHostAdapterSurfaceProps {
  readonly document: CreativeHostDocumentProjection;
  readonly locale: SupportedLocale;
  readonly runtime: CreativeHostRuntimeProjection;
  readonly onIntent: CreativeHostIntentHandler;
}

export interface CreativeHostAdapterDescriptor {
  readonly panelKind: string;
  readonly packageName: string;
  readonly mainKind: CreativeWorkbenchMainKind;
  readonly render: (props: CreativeHostAdapterSurfaceProps) => ReactNode;
}
