import { describe, expect, it } from 'vitest';
import {
  CUT_PROPERTY_PANEL_WIDTH_BOUNDS,
  PREVIEW_CONTROL_ACTION_PLACEMENTS,
  clampCutPropertyPanelWidth,
} from './PreviewControls.presenter';

describe('PreviewControls presenter', () => {
  it('places low-frequency actions in overflow while keeping playback-adjacent actions stable', () => {
    const placements = new Map(
      PREVIEW_CONTROL_ACTION_PLACEMENTS.map((action) => [action.id, action.placement]),
    );

    expect(placements.get('fps')).toBe('overflow');
    expect(placements.get('screenshot')).toBe('overflow');
    expect(placements.get('pip')).toBe('overflow');
    expect(placements.get('quality')).toBe('settings');
    expect(placements.get('speed')).toBe('settings');
    expect(placements.get('fullscreen')).toBe('primary');
    expect(PREVIEW_CONTROL_ACTION_PLACEMENTS.map((action) => action.id)).not.toContain(
      'propertyPanel',
    );
  });

  it('clamps property panel width to the Cut bounds', () => {
    expect(CUT_PROPERTY_PANEL_WIDTH_BOUNDS).toEqual({ minSize: 200, maxSize: 400 });
    expect(clampCutPropertyPanelWidth(120)).toBe(200);
    expect(clampCutPropertyPanelWidth(280)).toBe(280);
    expect(clampCutPropertyPanelWidth(520)).toBe(400);
  });
});
