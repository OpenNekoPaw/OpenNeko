import { describe, expect, it } from 'vitest';
import {
  createCanvasSubsystemManifestRegistry,
  getCanvasSubsystemManifest,
  listCanvasSubsystemManifests,
} from '../subsystems/manifestRegistry';

describe('extension Canvas subsystem manifest registry', () => {
  it('exposes pure manifest data without Webview registrations', () => {
    const manifests = listCanvasSubsystemManifests();
    const registry = createCanvasSubsystemManifestRegistry();

    expect(manifests).toHaveLength(5);
    expect(registry.get('storyboard')).toMatchObject({
      id: 'storyboard',
      triggerNodeTypes: expect.arrayContaining(['shot', 'scene', 'gallery']),
    });
    expect(getCanvasSubsystemManifest('narrative')).toMatchObject({
      id: 'narrative',
      connectionTypes: ['choice'],
    });
    expect(JSON.stringify(manifests)).toContain('narrative-choice-target');
  });
});
