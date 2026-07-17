import type React from 'react';
import type { CanvasSubsystemManifest } from '@neko/shared';
import type { NodeTypeDescriptorRegistry } from '../components/nodes/nodeTypeDescriptor';
import type { NodeRendererRegistry } from '../components/nodes/nodeRendererTypes';

export interface FloatingPanelComponentProps {
  onClose?: () => void;
}

export interface PlaybackControllerComponentProps {
  activeSubsystemIds?: readonly string[];
}

export interface FloatingPanelDefinition {
  readonly id: string;
  readonly title: string;
  readonly titleKey?: string;
  readonly component: React.LazyExoticComponent<React.ComponentType<FloatingPanelComponentProps>>;
}

export interface PlaybackControllerDefinition {
  readonly id: string;
  readonly title: string;
  readonly titleKey?: string;
  readonly component: React.LazyExoticComponent<
    React.ComponentType<PlaybackControllerComponentProps>
  >;
}

export interface WebviewSubsystemRegistration {
  readonly manifest: CanvasSubsystemManifest;
  readonly nodeRenderers?: NodeRendererRegistry;
  readonly nodeTypeDescriptors?: NodeTypeDescriptorRegistry;
  readonly floatingPanels?: readonly FloatingPanelDefinition[];
  readonly playbackController?: PlaybackControllerDefinition;
}

export type WebviewSubsystemLoader = () => Promise<WebviewSubsystemRegistration>;
