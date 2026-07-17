export const MEDIA_TASK_DELIVERY_CONFIG_SECTION = 'neko.agent.media';
export const MEDIA_TASK_OUTPUT_DIR_SETTING_KEY = 'outputDir';
export const MEDIA_TASK_SHOW_SAVE_NOTIFICATION_SETTING_KEY = 'showSaveNotification';
export const DEFAULT_MEDIA_TASK_CONFIGURED_OUTPUT_DIR = '';
export const DEFAULT_MEDIA_TASK_SHOW_SAVE_NOTIFICATION = true;

export interface MediaTaskDeliverySettingsInput {
  readonly workspaceRoot?: string;
  readonly configuredOutputDir?: string;
  readonly defaultOutputDir?: string;
  readonly configuredShowSaveNotification?: boolean;
}

export interface MediaTaskDeliverySettingsPlan {
  readonly workspaceRoot?: string;
  readonly outputDir?: string;
  readonly showSaveNotification: boolean;
}

export function buildMediaTaskDeliverySettingsPlan(
  input: MediaTaskDeliverySettingsInput,
): MediaTaskDeliverySettingsPlan {
  const outputDir = input.workspaceRoot
    ? input.configuredOutputDir || input.defaultOutputDir
    : undefined;

  return {
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    ...(outputDir ? { outputDir } : {}),
    showSaveNotification:
      input.configuredShowSaveNotification ?? DEFAULT_MEDIA_TASK_SHOW_SAVE_NOTIFICATION,
  };
}
