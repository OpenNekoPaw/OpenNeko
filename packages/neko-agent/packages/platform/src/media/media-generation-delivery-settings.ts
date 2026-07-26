export const MEDIA_GENERATION_DELIVERY_CONFIG_SECTION = 'neko.agent.media';
export const MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY = 'outputDir';
export const MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION_SETTING_KEY = 'showSaveNotification';
export const DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR = '';
export const DEFAULT_MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION = true;

export interface MediaGenerationDeliverySettingsInput {
  readonly workspaceRoot?: string;
  readonly configuredOutputDir?: string;
  readonly defaultOutputDir?: string;
  readonly configuredShowSaveNotification?: boolean;
}

export interface MediaGenerationDeliverySettingsPlan {
  readonly workspaceRoot?: string;
  readonly outputDir?: string;
  readonly showSaveNotification: boolean;
}

export function buildMediaGenerationDeliverySettingsPlan(
  input: MediaGenerationDeliverySettingsInput,
): MediaGenerationDeliverySettingsPlan {
  const outputDir = input.workspaceRoot
    ? input.configuredOutputDir || input.defaultOutputDir
    : undefined;

  return {
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    ...(outputDir ? { outputDir } : {}),
    showSaveNotification:
      input.configuredShowSaveNotification ?? DEFAULT_MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION,
  };
}
