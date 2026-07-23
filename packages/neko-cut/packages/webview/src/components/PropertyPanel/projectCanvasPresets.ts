import type { CutCommand, CutProjectProfile } from '@neko-cut/domain';

export type ProjectCanvasPresetId = 'tv' | 'cinema' | 'short-video' | 'square';

export interface ProjectCanvasPreset {
  readonly id: ProjectCanvasPresetId;
  readonly profile: string;
  readonly width: number;
  readonly height: number;
  readonly labelKey:
    | 'propertyPanel.project.preset.tv'
    | 'propertyPanel.project.preset.cinema'
    | 'propertyPanel.project.preset.shortVideo'
    | 'propertyPanel.project.preset.square';
}

export const PROJECT_CANVAS_PRESETS = [
  {
    id: 'tv',
    profile: 'tv-1080p',
    width: 1920,
    height: 1080,
    labelKey: 'propertyPanel.project.preset.tv',
  },
  {
    id: 'cinema',
    profile: 'cinema-2k-scope',
    width: 2048,
    height: 858,
    labelKey: 'propertyPanel.project.preset.cinema',
  },
  {
    id: 'short-video',
    profile: 'short-video-1080p',
    width: 1080,
    height: 1920,
    labelKey: 'propertyPanel.project.preset.shortVideo',
  },
  {
    id: 'square',
    profile: 'square-1080p',
    width: 1080,
    height: 1080,
    labelKey: 'propertyPanel.project.preset.square',
  },
] as const satisfies readonly ProjectCanvasPreset[];

export function projectCanvasPresetId(
  profile: Pick<CutProjectProfile, 'width' | 'height'>,
): ProjectCanvasPresetId | 'custom' {
  return (
    PROJECT_CANVAS_PRESETS.find(
      (preset) => preset.width === profile.width && preset.height === profile.height,
    )?.id ?? 'custom'
  );
}

export function projectCanvasCommandForPreset(
  presetId: string,
): Extract<CutCommand, { readonly type: 'set-project-canvas' }> {
  const preset = PROJECT_CANVAS_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error(`Unknown Cut project Canvas preset: ${presetId}`);
  return {
    type: 'set-project-canvas',
    profile: preset.profile,
    width: preset.width,
    height: preset.height,
  };
}
