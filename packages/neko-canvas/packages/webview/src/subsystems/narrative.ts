import { lazy } from 'react';
import { getBuiltInCanvasSubsystemManifest } from '@neko/shared';
import { createNarrativeNodeTypeDescriptors } from './narrative/descriptors';
import { createNarrativeNodeRendererRegistry } from './narrative/renderers';
import type { WebviewSubsystemRegistration } from './types';

const NARRATIVE_MANIFEST = getBuiltInCanvasSubsystemManifest('narrative');

if (!NARRATIVE_MANIFEST) {
  throw new Error('Missing built-in narrative Canvas subsystem manifest');
}

const narrativeRegistration: WebviewSubsystemRegistration = {
  manifest: NARRATIVE_MANIFEST,
  nodeRenderers: createNarrativeNodeRendererRegistry(),
  nodeTypeDescriptors: createNarrativeNodeTypeDescriptors(),
  floatingPanels: [
    {
      id: 'narrative.variables',
      title: 'Narrative Variables',
      titleKey: 'panel.narrativeVariables.title',
      component: lazy(() => import('./narrative/NarrativeVariablesPanel')),
    },
  ],
  playbackController: {
    id: 'narrative.playback',
    title: 'Narrative Playback',
    titleKey: 'toolbar.narrativePlayback',
    component: lazy(() => import('./narrative/NarrativePlaybackController')),
  },
};

export default narrativeRegistration;
