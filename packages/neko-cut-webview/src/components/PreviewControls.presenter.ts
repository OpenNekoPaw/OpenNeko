export const CUT_PROPERTY_PANEL_WIDTH_BOUNDS = {
  minSize: 200,
  maxSize: 400,
} as const;

export interface PreviewControlActionPlacement {
  readonly id: 'quality' | 'speed' | 'fps' | 'screenshot' | 'pip' | 'fullscreen';
  readonly placement: 'primary' | 'settings' | 'overflow';
}

export const PREVIEW_CONTROL_ACTION_PLACEMENTS = [
  { id: 'quality', placement: 'settings' },
  { id: 'speed', placement: 'settings' },
  { id: 'fps', placement: 'overflow' },
  { id: 'screenshot', placement: 'overflow' },
  { id: 'pip', placement: 'overflow' },
  { id: 'fullscreen', placement: 'primary' },
] as const satisfies readonly PreviewControlActionPlacement[];

export function clampCutPropertyPanelWidth(width: number): number {
  return Math.max(
    CUT_PROPERTY_PANEL_WIDTH_BOUNDS.minSize,
    Math.min(CUT_PROPERTY_PANEL_WIDTH_BOUNDS.maxSize, width),
  );
}
