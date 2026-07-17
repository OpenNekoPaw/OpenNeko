import { getBuiltInCanvasSubsystemManifest } from '@neko/shared';
import { createStoryboardNodeRendererRegistry } from './storyboard/renderers';
import { createStoryboardNodeTypeDescriptors } from './storyboard/descriptors';
import type { WebviewSubsystemRegistration } from './types';

const STORYBOARD_MANIFEST = getBuiltInCanvasSubsystemManifest('storyboard');

if (!STORYBOARD_MANIFEST) {
  throw new Error('Missing built-in storyboard Canvas subsystem manifest');
}

const storyboardRegistration: WebviewSubsystemRegistration = {
  manifest: STORYBOARD_MANIFEST,
  nodeRenderers: createStoryboardNodeRendererRegistry(),
  nodeTypeDescriptors: createStoryboardNodeTypeDescriptors(),
};

export default storyboardRegistration;
